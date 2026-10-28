import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createServer } from "node:http";
import { ZipFile as ZipWriter } from "yazl";
import { RandomAccessReader, fromRandomAccessReader, type ZipFile as ZipReader } from "yauzl";
import { unzipSync } from "fflate";
import sharp from "sharp";
import { PhotoJobStore, MAX_ARCHIVE_BYTES, type LocalPhotoRender } from "../server/photoJobs.ts";
import { archiveEntries, extractPhoto, photoDownload } from "../server/photoArchive.ts";
import { handlePhotoApi } from "../server/photoApi.ts";
import { CloudPhotoError, photoCloudRequest, parsePhotoAssessment } from "../server/photoCloud.ts";
import { DEFAULT_REPAIR_OPTIONS, defaultManualEdit, editedPhotoPath, safePhotoPath, type PhotoRepairJob } from "../src/lib/photoRepair.ts";

async function zipBytes(files: [string, Buffer][], zip64 = false) {
  const zip = new ZipWriter();
  const parts: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on("data", (chunk: Buffer) => parts.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(parts))); zip.on("error", reject);
  });
  for (const [name, data] of files) zip.addBuffer(data, name, { compress: false });
  zip.end({ forceZip64Format: zip64, comment: "" });
  return done;
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "webtools-photo-"));
  const photo = await sharp({ create: { width: 96, height: 64, channels: 3, background: { r: 180, g: 150, b: 85 } } }).jpeg().toBuffer();
  return { root, photo };
}

async function loaded(store: PhotoJobStore, files: [string, Buffer][], zip64 = false) {
  const bytes = await zipBytes(files, zip64);
  const job = await store.create("family.zip", bytes.length);
  const midpoint = Math.floor(bytes.length / 2);
  await store.upload(job.id, 0, Readable.from([bytes.subarray(0, midpoint)]));
  await store.upload(job.id, midpoint, Readable.from([bytes.subarray(midpoint)]));
  await store.finalize(job.id);
  return job;
}

async function finished(job: PhotoRepairJob) {
  const deadline = Date.now() + 25_000;
  while (job.state === "running" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 30));
  assert.notEqual(job.state, "running", "job must settle");
  // The run's finally handler releases its mutation lock immediately after the persisted state.
  await new Promise((resolve) => setTimeout(resolve, 30));
}

/** Lets queued promise work run. Manual edits reach the render slot without I/O, so this is enough for them. */
const turn = () => new Promise((resolve) => setImmediate(resolve));

/** Stands in for the CPU worker: writes a small real image, records overlap, and can hold renders at a gate. */
function renderProbe() {
  const gates: (() => void)[] = [];
  const arrivals: (() => void)[] = [];
  const probe = {
    running: 0, peak: 0, calls: 0, hold: false, failNext: false, jobs: [] as string[],
    /** Resolves once `count` renders have begun. */
    started(count: number) {
      return new Promise<void>((resolve) => {
        const check = () => { if (probe.calls >= count) resolve(); else arrivals.push(check); };
        check();
      });
    },
    release() { probe.hold = false; for (const open of gates.splice(0)) open(); },
    render: (async (task) => {
      probe.calls++; probe.running++; probe.peak = Math.max(probe.peak, probe.running);
      probe.jobs.push(path.basename(path.dirname(task.output)));
      const fail = probe.failNext; probe.failNext = false;
      for (const check of arrivals.splice(0)) check();
      try {
        if (probe.hold) await new Promise<void>((resolve) => gates.push(resolve));
        if (fail) throw new Error("render failed");
        const info = await sharp(task.input).toFormat(task.options.format).toFile(task.output);
        return { width: info.width, height: info.height };
      } finally { probe.running--; }
    }) as LocalPhotoRender,
  };
  return probe;
}

async function processed(store: PhotoJobStore, photo: Buffer, name: string) {
  const job = await loaded(store, [[name, photo]]);
  await store.start(job.id, DEFAULT_REPAIR_OPTIONS, "all", false, false); await finished(job);
  assert.equal(job.state, "complete");
  return job;
}

function brighter() { const edit = defaultManualEdit(); edit.adjustments.brightness = 10; return edit; }

test("safe edited paths preserve folders and resolve case-insensitive collisions", () => {
  const used = new Set<string>();
  assert.equal(editedPhotoPath("Roll 1/Scan.JPG", "jpeg", used), "Roll 1/Scan_edited.jpg");
  assert.equal(editedPhotoPath("roll 1/scan.png", "jpeg", used), "roll 1/scan_edited_2.jpg");
  for (const name of ["../scan.jpg", "/scan.jpg", "C:/scan.jpg", "roll/../scan.jpg", "roll/./scan.jpg", "roll//scan.jpg", "bad\0.jpg"]) {
    assert.throws(() => safePhotoPath(name), /unsafe/);
  }
});

test("resumable uploads roll back partial failures and recover their actual disk offset", async () => {
  const { root, photo } = await fixture();
  try {
    const store = new PhotoJobStore(root);
    const bytes = await zipBytes([["scan.jpg", photo]]);
    const job = await store.create("scans.zip", bytes.length);
    await store.upload(job.id, 0, Readable.from([bytes.subarray(0, 30)]));
    await assert.rejects(store.upload(job.id, 0, Readable.from([bytes])), /offset/);
    const interrupted = Readable.from((async function* () { yield bytes.subarray(30, 60); throw new Error("Upload disconnected"); })());
    await assert.rejects(store.upload(job.id, 30, interrupted), /disconnected/);
    assert.equal((await stat(store.archive(job.id))).size, 30);
    const restarted = new PhotoJobStore(root);
    assert.equal((await restarted.uploadStatus(job.id)).uploaded, 30);
    await restarted.upload(job.id, 30, Readable.from([bytes.subarray(30)]));
    const ready = await restarted.finalize(job.id);
    assert.equal(ready.entries.length, 1);
    assert.equal(ready.state, "ready");
    assert.ok(MAX_ARCHIVE_BYTES > 2.59 * 1024 ** 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ZIP64 indexing supports 1,000 photos without decoding them", async () => {
  const { root, photo } = await fixture();
  try {
    const store = new PhotoJobStore(root);
    const job = await loaded(store, Array.from({ length: 1000 }, (_, i) => [`Roll/Scan ${i + 1}.jpg`, photo]), true);
    assert.equal(job.entries.length, 1000);
    assert.equal(job.entries[1].source, "Roll/Scan 2.jpg");
    assert.equal(job.entries[999].source, "Roll/Scan 1000.jpg");
    assert.ok(job.entries.every((e) => e.status === "pending"));
    assert.deepEqual((await readdir(store.directory(job.id))).sort(), ["job.json", "source.zip"], "indexing must not extract photo data");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("archive reads handle image offsets above 2 GB with bounded reads", async () => {
  const { root, photo } = await fixture();
  try {
    const bytes = await zipBytes([["scan.jpg", photo]]);
    const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const directory = bytes.readUInt32LE(end + 16);
    const offset = 2_780_000_000;
    bytes.writeUInt32LE(offset, directory + 42);
    bytes.writeUInt32LE(directory + offset, end + 16);
    let totalRead = 0;
    class VirtualArchive extends RandomAccessReader {
      _readStreamForRange(start: number, finish: number) {
        const size = finish - start;
        totalRead += size;
        assert.ok(size < 100_000, "archive data must be read in small ranges");
        const data = Buffer.alloc(size);
        const overlap = Math.max(start, offset);
        if (finish > overlap) bytes.copy(data, overlap - start, overlap - offset, finish - offset);
        return Readable.from([data]);
      }
    }
    const zip = await new Promise<ZipReader>((resolve, reject) => fromRandomAccessReader(new VirtualArchive(), offset + bytes.length,
      { lazyEntries: true, autoClose: false }, (error, result) => error ? reject(error) : resolve(result!)));
    try {
      const entries = await archiveEntries(zip);
      assert.equal(entries.length, 1);
      const target = path.join(root, "scan.jpg");
      await extractPhoto(zip, entries[0], target);
      assert.deepEqual(await readFile(target), photo);
      assert.ok(totalRead < 200_000, `read ${totalRead} bytes of a virtual 2.59 GB archive`);
    } finally { zip.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CPU trial, resume, broken-image isolation, original preservation, rotation and streamed export", async () => {
  const { root, photo } = await fixture();
  try {
    const exif = await sharp(photo).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const store = new PhotoJobStore(root);
    const job = await loaded(store, [...Array.from({ length: 6 }, (_, i): [string, Buffer] => [`Roll/Scan ${i + 1}.jpg`, i === 0 ? exif : photo]), ["Roll/Scan 7.jpg", Buffer.from("broken image")], ["notes.txt", Buffer.from("preserve source")]]);
    const original = await readFile(store.archive(job.id));
    await store.start(job.id, DEFAULT_REPAIR_OPTIONS, 5, false, false);
    await finished(job);
    assert.equal(job.entries.filter((e) => e.status === "done").length, 5);
    assert.equal(job.state, "paused");
    assert.match(job.error || "", /trial/);
    assert.equal(job.entries[0].width, 64);
    assert.equal(job.entries[0].height, 96);
    await store.start(job.id, DEFAULT_REPAIR_OPTIONS, "all", false, false);
    await finished(job);
    assert.equal(job.state, "complete");
    assert.equal(job.entries.filter((e) => e.status === "done").length, 6);
    assert.equal(job.entries.filter((e) => e.status === "failed").length, 1);
    assert.equal(job.ignored, 1);
    const outputMeta = await sharp(store.output(job, job.entries[0])).metadata();
    assert.equal(outputMeta.orientation, undefined, "orientation tag is removed after pixels are normalized");
    await store.rotate(job.id, job.entries[0].id, 90);
    assert.equal(job.entries[0].width, 96);
    const result = photoDownload(job, (entry) => store.output(job, entry));
    const buffers: Buffer[] = [];
    for await (const chunk of result.outputStream) buffers.push(Buffer.from(chunk));
    const files = unzipSync(Buffer.concat(buffers));
    assert.ok(files["Roll/Scan 1_edited.jpg"]);
    assert.equal(Object.keys(files).length, 7, "six edited files and one report");
    assert.equal(JSON.parse(Buffer.from(files["_webtools_report.json"]).toString()).photos.length, 7);
    assert.deepEqual(await readFile(store.archive(job.id)), original);
    const recovered = await new PhotoJobStore(root).get(job.id);
    assert.equal(recovered.entries[0].rotation, 90);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("manual edits render at full resolution from a retained base, persist, and export without cumulative changes", async () => {
  const { root, photo } = await fixture();
  try {
    const store = new PhotoJobStore(root);
    const job = await loaded(store, [["roll/scan.jpg", photo]]);
    const options = { ...DEFAULT_REPAIR_OPTIONS, color: false, format: "png" as const };
    await store.start(job.id, options, "all", false, false); await finished(job);
    const entry = job.entries[0];
    const base = store.output(job, entry);
    const batchBytes = await readFile(base);
    const original = await readFile(store.archive(job.id));
    const edit = defaultManualEdit();
    edit.rotation = 90; edit.adjustments.brightness = 25; edit.adjustments.warmth = -20;
    await store.edit(job.id, entry.id, edit, 0);
    assert.equal(entry.width, 64); assert.equal(entry.height, 96);
    assert.equal(entry.rotation, 90); assert.equal(entry.review, false); assert.ok(entry.reviewedAt);
    const first = await readFile(store.output(job, entry));
    const pixels = await sharp(first).raw().toBuffer();
    const originalPixels = await sharp(batchBytes).rotate(90).raw().toBuffer();
    assert.notDeepEqual(pixels, originalPixels, "manual sliders must change the saved pixels");
    await store.edit(job.id, entry.id, edit, 1);
    assert.deepEqual(await readFile(store.output(job, entry)), first, "saving the same settings again must not compound corrections");
    assert.deepEqual(await readFile(base), batchBytes, "the retained batch image must never be overwritten");
    const savedVersion = entry.editVersion;
    await assert.rejects(store.edit(job.id, entry.id, edit, 0), /another session/);
    await assert.rejects(store.edit(job.id, entry.id, { ...edit, adjustments: { ...edit.adjustments, warmth: 101 } }, savedVersion), /warmth/);
    assert.equal(entry.editVersion, savedVersion);
    const recovered = await new PhotoJobStore(root).get(job.id);
    assert.deepEqual(recovered.entries[0].manual, edit); assert.ok(recovered.entries[0].reviewedAt);
    const archive = photoDownload(job, (entry) => store.output(job, entry));
    const chunks: Buffer[] = [];
    for await (const chunk of archive.outputStream) chunks.push(Buffer.from(chunk));
    const exported = unzipSync(Buffer.concat(chunks));
    assert.deepEqual(Buffer.from(exported["roll/scan_edited.png"]), first);
    await store.edit(job.id, entry.id, defaultManualEdit(), savedVersion);
    assert.equal(entry.width, 96); assert.equal(entry.height, 64);
    assert.deepEqual(await sharp(store.output(job, entry)).raw().toBuffer(), await sharp(batchBytes).raw().toBuffer(), "reset must restore batch pixels exactly for PNG");
    assert.deepEqual(await readFile(store.archive(job.id)), original);
    assert.equal(job.analysisAttempts, 0); assert.equal(job.repairAttempts, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a failed manual render preserves the last saved result and releases its lock", async () => {
  const { root, photo } = await fixture();
  try {
    const store = new PhotoJobStore(root);
    const job = await loaded(store, [["scan.jpg", photo]]);
    await store.start(job.id, DEFAULT_REPAIR_OPTIONS, "all", false, false); await finished(job);
    const entry = job.entries[0];
    const base = store.output(job, entry);
    const baseBytes = await readFile(base);
    const edit = defaultManualEdit(); edit.rotation = 90;
    await store.edit(job.id, entry.id, edit, 0);
    const previous = JSON.stringify(entry);
    const savedBytes = await readFile(store.output(job, entry));
    await writeFile(base, "not an image");
    await assert.rejects(store.edit(job.id, entry.id, defaultManualEdit(), 1));
    assert.equal(JSON.stringify(entry), previous);
    assert.deepEqual(await readFile(store.output(job, entry)), savedBytes);
    const release = store.beginDownload(job.id); release();
    assert.ok(!(await readdir(store.directory(job.id))).some((name) => name.endsWith(".tmp")));
    await writeFile(base, baseBytes);
    await store.edit(job.id, entry.id, defaultManualEdit(), 1);
    assert.deepEqual(await readFile(store.output(job, entry)), baseBytes, "reset must also restore JPEG bytes exactly");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("manual edits on different jobs render one at a time and both finish", async () => {
  const { root, photo } = await fixture();
  const probe = renderProbe();
  try {
    const store = new PhotoJobStore(root, undefined, probe.render);
    const first = await processed(store, photo, "a.jpg");
    const second = await processed(store, photo, "b.jpg");
    probe.hold = true;
    const calls = probe.calls;
    const editing = [store.edit(first.id, 0, brighter(), 0)];
    await probe.started(calls + 1);
    editing.push(store.edit(second.id, 0, brighter(), 0));
    await turn();
    assert.equal(probe.running, 1, "the second job's edit must wait for the render slot");
    assert.equal(probe.calls, calls + 1);
    probe.release();
    await Promise.all(editing);
    assert.equal(probe.peak, 1);
    assert.equal(first.entries[0].editVersion, 1); assert.equal(second.entries[0].editVersion, 1);
  } finally { probe.release(); await rm(root, { recursive: true, force: true }); }
});

test("a manual edit queues behind a batch render and runs before the batch's next photo", async () => {
  const { root, photo } = await fixture();
  const probe = renderProbe();
  try {
    const store = new PhotoJobStore(root, undefined, probe.render);
    const done = await processed(store, photo, "a.jpg");
    const batch = await loaded(store, [["b.jpg", photo], ["c.jpg", photo]]);
    probe.hold = true;
    const calls = probe.calls;
    await store.start(batch.id, DEFAULT_REPAIR_OPTIONS, "all", false, false);
    await probe.started(calls + 1);
    await assert.rejects(store.start(done.id, DEFAULT_REPAIR_OPTIONS, "all", false, false), /Another photo job/, "only one batch runs at a time");
    const editing = store.edit(done.id, 0, brighter(), 0);
    await turn();
    assert.equal(probe.running, 1, "the edit must wait for the batch render");
    probe.release();
    await editing; await finished(batch);
    assert.equal(probe.peak, 1);
    assert.deepEqual(probe.jobs.slice(calls), [batch.id, done.id, batch.id], "the slot is released between batch photos, in arrival order");
    assert.equal(batch.state, "complete"); assert.equal(done.entries[0].editVersion, 1);
  } finally { probe.release(); await rm(root, { recursive: true, force: true }); }
});

test("a batch can start while another job is being edited, and its render waits for the slot", async () => {
  const { root, photo } = await fixture();
  const probe = renderProbe();
  try {
    const store = new PhotoJobStore(root, undefined, probe.render);
    const edited = await processed(store, photo, "a.jpg");
    const batch = await loaded(store, [["b.jpg", photo]]);
    probe.hold = true;
    const calls = probe.calls;
    const editing = store.edit(edited.id, 0, brighter(), 0);
    await probe.started(calls + 1);
    await store.start(batch.id, DEFAULT_REPAIR_OPTIONS, "all", false, false);
    await assert.rejects(store.start(edited.id, DEFAULT_REPAIR_OPTIONS, "all", false, false), /Pause/, "the edited job keeps its own lock");
    // The batch reaches the slot after archive I/O; give it time to try. A correct limiter never lets it in early.
    const deadline = Date.now() + 5_000;
    while (batch.entries[0].status !== "processing" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(probe.calls, calls + 1, "the batch render must wait for the edit");
    probe.release();
    await editing; await finished(batch);
    assert.equal(probe.peak, 1);
    assert.equal(batch.state, "complete"); assert.equal(edited.entries[0].editVersion, 1);
  } finally { probe.release(); await rm(root, { recursive: true, force: true }); }
});

test("a failed render releases the slot to the next queued edit", async () => {
  const { root, photo } = await fixture();
  const probe = renderProbe();
  try {
    const store = new PhotoJobStore(root, undefined, probe.render);
    const first = await processed(store, photo, "a.jpg");
    const second = await processed(store, photo, "b.jpg");
    const previous = JSON.stringify(first.entries[0]);
    probe.hold = true; probe.failNext = true;
    const calls = probe.calls;
    const failing = store.edit(first.id, 0, brighter(), 0);
    await probe.started(calls + 1);
    const waiting = store.edit(second.id, 0, brighter(), 0);
    await turn();
    assert.equal(probe.running, 1);
    probe.release();
    await assert.rejects(failing, /render failed/);
    await waiting;
    assert.equal(second.entries[0].editVersion, 1);
    assert.equal(JSON.stringify(first.entries[0]), previous, "a failed render leaves the saved result selected");
    await store.edit(first.id, 0, brighter(), 0);
    assert.equal(first.entries[0].editVersion, 1);
    assert.equal(probe.peak, 1);
  } finally { probe.release(); await rm(root, { recursive: true, force: true }); }
});

test("cloud damage selection, uncertain orientation, hard repair limit and cached assessment on resume", async () => {
  const { root, photo } = await fixture();
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    let assessments = 0;
    let repairs = 0;
    const store = new PhotoJobStore(root, {
      assess: async () => {
        assessments++;
        return assessments === 1 ? { rotation: 90, confidence: 0.99, damaged: false, note: "Clean sideways scan" }
          : { rotation: 90, confidence: 0.3, damaged: true, note: "Ambiguous scene, visible scratch" };
      },
      restore: async () => { repairs++; return photo; },
    });
    const job = await loaded(store, [["a.jpg", photo], ["b.jpg", photo], ["c.jpg", photo]]);
    const options = { ...DEFAULT_REPAIR_OPTIONS, repair: "auto" as const, orientation: "scene" as const, maxRepairs: 1 };
    await store.start(job.id, options, "all", false, true); await finished(job);
    assert.equal(job.state, "paused"); assert.equal(repairs, 1); assert.equal(assessments, 3);
    assert.equal(job.entries[0].rotation, 90, "confident scene rotation is applied");
    assert.equal(job.entries[0].width, 64); assert.equal(job.entries[0].height, 96);
    assert.equal(job.entries[0].repaired, false, "a clean photo must not incur an image edit");
    assert.equal(job.entries[1].rotation, 0, "uncertain scene is not auto-rotated");
    assert.equal(job.entries[1].review, true); assert.equal(job.entries[2].status, "pending");
    assert.equal(job.repairAttempts, 1);
    await store.start(job.id, { ...options, maxRepairs: 2 }, "all", false, true); await finished(job);
    assert.equal(job.state, "complete"); assert.equal(repairs, 2); assert.equal(assessments, 3, "saved assessments must not be charged again");
    await store.approve(job.id, job.entries[1].id);
    assert.equal(job.entries[1].review, false);
    await assert.rejects(store.start(job.id, { ...options, format: "png" }, "all", false, true), /locked/);
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    await rm(root, { recursive: true, force: true });
  }
});

test("cloud errors pause the batch without retrying paid requests; restart flags in-flight work", async () => {
  const { root, photo } = await fixture();
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    let repairs = 0;
    const store = new PhotoJobStore(root, { assess: async () => { throw new Error("not used"); }, restore: async () => { repairs++; throw new CloudPhotoError("quota exhausted"); } });
    const job = await loaded(store, [["a.jpg", photo], ["b.jpg", photo]]);
    await store.start(job.id, { ...DEFAULT_REPAIR_OPTIONS, repair: "all" }, "all", false, true); await finished(job);
    assert.equal(repairs, 1); assert.equal(job.state, "paused"); assert.equal(job.entries[0].status, "failed");
    assert.equal(job.entries[1].status, "pending");
    job.state = "running"; job.entries[1].status = "processing"; job.entries[1].cloudInFlight = true;
    await store.save(job);
    const recovered = await new PhotoJobStore(root).get(job.id);
    assert.equal(recovered.state, "paused"); assert.equal(recovered.entries[1].status, "failed");
    assert.match(recovered.entries[1].error!, /billed/);
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    await rm(root, { recursive: true, force: true });
  }
});

test("pause finishes the current paid photo and prevents the next request; active jobs cannot be exported or deleted", async () => {
  const { root, photo } = await fixture();
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  let release: (value: Buffer) => void = () => {};
  try {
    let began: () => void = () => {};
    const started = new Promise<void>((resolve) => { began = resolve; });
    const gate = new Promise<Buffer>((resolve) => { release = resolve; });
    let repairs = 0;
    const store = new PhotoJobStore(root, { assess: async () => { throw new Error("not used"); }, restore: async () => { repairs++; began(); return gate; } });
    const job = await loaded(store, [["a.jpg", photo], ["b.jpg", photo]]);
    await store.start(job.id, { ...DEFAULT_REPAIR_OPTIONS, repair: "all" }, "all", false, true);
    await started;
    await assert.rejects(store.remove(job.id), /Pause/);
    assert.throws(() => store.beginDownload(job.id), /Pause/);
    await store.pause(job.id);
    release(photo);
    await finished(job);
    assert.equal(job.state, "paused");
    assert.equal(job.entries[0].status, "done");
    assert.equal(job.entries[1].status, "pending");
    assert.equal(repairs, 1);
  } finally {
    release(photo);
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    await rm(root, { recursive: true, force: true });
  }
});

test("provider errors are redacted, not retried, and invalid vision values are rejected", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    let requests = 0;
    const fetcher: typeof fetch = async () => { requests++; return new Response(JSON.stringify({ error: { message: "secret-provider-text" } }), { status: 429 }); };
    await assert.rejects(photoCloudRequest("images/edits", {}, fetcher), (error: Error) => /429/.test(error.message) && !error.message.includes("secret-provider-text"));
    assert.equal(requests, 1);
    for (const assessment of [{ rotation: 45, confidence: 1, damaged: true, note: "" }, { rotation: 90, confidence: 2, damaged: false, note: "" }, { rotation: 0, confidence: NaN, damaged: true, note: "" }]) {
      assert.throws(() => parsePhotoAssessment(assessment), /invalid/);
    }
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("HTTP API streams upload/download and refuses cross-site commands and invalid IDs", async () => {
  const { root, photo } = await fixture();
  const store = new PhotoJobStore(root);
  const server = createServer((req, res) => { void handlePhotoApi(req, res, store); });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/photo-repair`;
  try {
    const blocked = await fetch(base, { method: "POST", headers: { Origin: "https://unrelated.example", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(blocked.status, 400);
    assert.equal((await fetch(`${base}/not-a-job`)).status, 400);
    const bytes = await zipBytes([["nested/scan.jpg", photo]]);
    const created = await fetch(base, { method: "POST", body: JSON.stringify({ name: "test.zip", size: bytes.length }) });
    const job = await created.json() as PhotoRepairJob;
    assert.equal(created.status, 201);
    assert.equal((await fetch(`${base}/${job.id}/upload?offset=0`, { method: "PUT", body: bytes })).status, 200);
    assert.equal((await fetch(`${base}/${job.id}/finalize`, { method: "POST" })).status, 200);
    await store.start(job.id, DEFAULT_REPAIR_OPTIONS, "all", false, false);
    await finished(await store.get(job.id));
    const sourcePreview = await (await fetch(`${base}/${job.id}/photos/0/edit-base`)).arrayBuffer();
    const edit = defaultManualEdit(); edit.rotation = 90; edit.adjustments.brightness = 15;
    const edited = await fetch(`${base}/${job.id}/photos/0/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edit, version: 0 }) });
    assert.equal(edited.status, 200);
    const editedJob = await edited.json() as PhotoRepairJob;
    assert.equal(editedJob.entries[0].width, 64); assert.equal(editedJob.entries[0].height, 96);
    assert.deepEqual(await (await fetch(`${base}/${job.id}/photos/0/edit-base`)).arrayBuffer(), sourcePreview, "editing source preview stays stable after saving");
    const download = await fetch(`${base}/${job.id}/download`);
    assert.equal(download.headers.get("content-type"), "application/zip");
    const files = unzipSync(new Uint8Array(await download.arrayBuffer()));
    assert.ok(files["nested/scan_edited.jpg"]);
    const exportedMeta = await sharp(files["nested/scan_edited.jpg"]).metadata();
    assert.equal(exportedMeta.width, 64); assert.equal(exportedMeta.height, 96);
    const report = JSON.parse(Buffer.from(files["_webtools_report.json"]).toString());
    assert.equal(report.photos[0].manual.adjustments.brightness, 15);
    assert.equal((await fetch(`${base}/${job.id}`, { method: "DELETE" })).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
