import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, readdir, rename, rm, stat, truncate, statfs, copyFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { Worker } from "node:worker_threads";
import sharp from "sharp";
import type { IncomingMessage } from "node:http";
import { DEFAULT_REPAIR_OPTIONS, defaultManualEdit, manualPhotoEdit, editedPhotoPath, repairOptions, usesCloud, type PhotoRepairJob, type PhotoRepairEntry, type RepairOptions, type RepairRotation } from "../src/lib/photoRepair.ts";
import { archiveEntries, extractPhoto, indexPhotoArchive, openPhotoArchive } from "./photoArchive.ts";
import { assessPhoto, restorePhoto, CloudPhotoError } from "./photoCloud.ts";
import type { LocalPhotoTask, MeasurePhotoTask, measureLocalPhoto } from "./photoWorker.ts";
import type { ColorAnalysis } from "../src/lib/photoColor.ts";

export const CHUNK_BYTES = 8 * 1024 ** 2;
export const MAX_ARCHIVE_BYTES = 8 * 1024 ** 3;
const MAX_JOBS = 20;

function messageOf(error: unknown) { return error instanceof Error ? error.message : "Could not process photo"; }

function photoWorker<T>(task: LocalPhotoTask | MeasurePhotoTask) {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(new URL("./photoWorker.ts", import.meta.url), { workerData: task });
    let answered = false;
    worker.once("message", (message: { result?: T; error?: string }) => {
      answered = true;
      if (message.error || !message.result) reject(new Error(message.error || "Image worker returned no result"));
      else resolve(message.result);
    });
    worker.once("error", reject);
    worker.once("exit", (code) => { if (!answered) reject(new Error(`Image worker exited without a result (code ${code})`)); });
  });
}

const localPhoto = (task: LocalPhotoTask) => photoWorker<{ width: number; height: number }>(task);

export class PhotoJobStore {
  readonly root: string;
  readonly jobs = new Map<string, PhotoRepairJob>();
  private ready?: Promise<void>;
  private writes = new Map<string, Promise<void>>();
  private uploads = new Set<string>();
  private active = new Set<string>();
  private pauseRequested = new Set<string>();
  private exporting = new Set<string>();
  private measurements = new Map<string, Promise<void>>();
  private readonly cloud: { assess: typeof assessPhoto; restore: typeof restorePhoto };

  constructor(root = process.env.PHOTO_REPAIR_DIR || path.resolve("data/photo-repair"), cloud = { assess: assessPhoto, restore: restorePhoto }) {
    this.root = path.resolve(root); this.cloud = cloud;
  }

  async init() {
    this.ready ??= (async () => {
      await mkdir(this.root, { recursive: true });
      for (const name of await readdir(this.root)) {
        if (!/^[a-f0-9-]{36}$/.test(name)) continue;
        try {
          const job = JSON.parse(await readFile(path.join(this.root, name, "job.json"), "utf8")) as PhotoRepairJob;
          if (job.id !== name) continue;
          if (job.state === "running" || job.state === "indexing") {
            job.state = job.state === "indexing" ? "uploading" : "paused";
            job.error = "Server restarted. Review the job and resume explicitly; paid requests are not automatically repeated.";
          }
          for (const entry of job.entries) if (entry.status === "processing") {
            entry.status = entry.cloudInFlight ? "failed" : "pending";
            if (entry.cloudInFlight) entry.error = "Interrupted during a paid request; it may have been billed. Check usage before retrying.";
            entry.cloudInFlight = false;
          }
          this.jobs.set(name, job);
          await this.save(job);
        } catch { /* An unfinished creation without a manifest is not a resumable job. */ }
      }
    })();
    return this.ready;
  }

  directory(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid photo job ID");
    return path.join(this.root, id);
  }
  archive(id: string) { return path.join(this.directory(id), "source.zip"); }
  output(job: PhotoRepairJob, entry: PhotoRepairEntry) { return path.join(this.directory(job.id), `${entry.id}.edited${entry.editVersion ? `.v${entry.editVersion}` : ""}.${job.options.format === "jpeg" ? "jpg" : job.options.format}`); }
  preview(id: string, entry: number, side: "before" | "after") { return path.join(this.directory(id), `${entry}.${side}.jpg`); }
  resultPreview(job: PhotoRepairJob, entry: PhotoRepairEntry) {
    return entry.editVersion ? path.join(this.directory(job.id), `${entry.id}.after.v${entry.editVersion}.jpg`) : this.preview(job.id, entry.id, "after");
  }

  async get(id: string) {
    await this.init();
    this.directory(id);
    const job = this.jobs.get(id);
    if (!job) throw new Error("Photo job not found");
    return job;
  }

  async save(job: PhotoRepairJob) {
    job.updatedAt = new Date().toISOString();
    const json = JSON.stringify(job);
    const previous = this.writes.get(job.id) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const file = path.join(this.directory(job.id), "job.json");
      await writeFile(`${file}.tmp`, json);
      await rename(`${file}.tmp`, file);
    });
    this.writes.set(job.id, next);
    try { await next; } finally { if (this.writes.get(job.id) === next) this.writes.delete(job.id); }
  }

  async list() { await this.init(); return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }

  async create(name: unknown, size: unknown) {
    await this.init();
    if (typeof name !== "string" || !/\.zip$/i.test(name) || name.length > 200) throw new Error("Choose a ZIP archive");
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 22 || size > MAX_ARCHIVE_BYTES) throw new Error("Choose a ZIP between 22 bytes and 8 GB");
    if (this.jobs.size >= MAX_JOBS) throw new Error("Keep up to 20 photo jobs. Remove an old job before adding another.");
    const disk = await statfs(this.root);
    if (disk.bavail * disk.bsize < size * 2 + 512 * 1024 ** 2) throw new Error("Not enough server disk space. Allow at least twice the ZIP size plus 512 MB to upload.");
    const now = new Date().toISOString();
    const job: PhotoRepairJob = { id: randomUUID(), name: name.replace(/[\x00-\x1f\x7f]/g, ""), size, uploaded: 0, createdAt: now,
      updatedAt: now, state: "uploading", options: { ...DEFAULT_REPAIR_OPTIONS }, entries: [], ignored: 0, repairAttempts: 0, analysisAttempts: 0 };
    await mkdir(this.directory(job.id));
    await writeFile(this.archive(job.id), "");
    this.jobs.set(job.id, job);
    await this.save(job);
    return job;
  }

  async upload(id: string, offset: number, input: NodeJS.ReadableStream) {
    const job = await this.get(id);
    if (job.state !== "uploading" || this.uploads.has(id)) throw new Error("This job is not ready for an upload chunk");
    this.uploads.add(id);
    try {
      const file = this.archive(id);
      const current = (await stat(file)).size;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset !== current) throw new Error(`Upload offset changed. Resume at byte ${current}.`);
      if (offset >= job.size) throw new Error("Upload is already complete");
      let bytes = 0;
      const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > CHUNK_BYTES || offset + bytes > job.size ? new Error("Upload chunk exceeds the allowed size") : null, chunk);
      } });
      try { await pipeline(input, limit, createWriteStream(file, { flags: "r+", start: offset })); }
      catch (error) { await truncate(file, offset); throw error; }
      if (!bytes) throw new Error("Upload chunk is empty");
      job.uploaded = offset + bytes;
      await this.save(job);
      return job.uploaded;
    } finally { this.uploads.delete(id); }
  }

  async uploadStatus(id: string) {
    const job = await this.get(id);
    if (job.state === "uploading" && !this.uploads.has(id)) job.uploaded = (await stat(this.archive(id))).size;
    return job;
  }

  async finalize(id: string) {
    const job = await this.uploadStatus(id);
    if (job.state !== "uploading" || this.uploads.has(id) || job.uploaded !== job.size) throw new Error("Finish uploading the ZIP before indexing it");
    job.state = "indexing";
    delete job.error;
    await this.save(job);
    try {
      const indexed = await indexPhotoArchive(this.archive(id), job.options);
      job.entries = indexed.photos;
      job.ignored = indexed.ignored;
      job.state = "ready";
    } catch (error) {
      job.state = "uploading";
      job.error = messageOf(error);
      throw error;
    } finally { await this.save(job); }
    return job;
  }

  async start(id: string, value: unknown, limit: unknown, retry: unknown, cloudConsent: unknown) {
    const job = await this.get(id);
    if (!["ready", "paused", "complete"].includes(job.state) || this.active.has(id) || this.exporting.has(id)) throw new Error("Pause processing and finish downloads before changing this job");
    if (this.active.size) throw new Error("Another photo job is processing. Pause it before starting this one.");
    const options = repairOptions(value);
    if (usesCloud(options) && (!process.env.OPENAI_API_KEY || cloudConsent !== true)) throw new Error("Cloud AI requires a server API key and permission to make paid requests");
    if (limit !== "all" && limit !== 5) throw new Error("Choose a five-photo trial or the remaining batch");
    const hasSavedPhoto = job.entries.some((e) => e.status === "done");
    const settingsChanged = JSON.stringify({ ...options, maxRepairs: 0 }) !== JSON.stringify({ ...job.options, maxRepairs: 0 });
    if (hasSavedPhoto && settingsChanged) {
      throw new Error("Processing settings are locked after the first completed photo. You can raise the repair limit, or create a new job to use different settings.");
    }
    job.options = options;
    const used = new Set<string>();
    for (const entry of job.entries) {
      entry.output = editedPhotoPath(entry.source, options.format, used);
      // Assessments describe the prepared raster. Changed color settings need a fresh assessment.
      if (settingsChanged) { delete entry.analysis; delete entry.note; }
      if (retry === true && entry.status === "failed") { entry.status = "pending"; delete entry.error; }
    }
    if (!job.entries.some((e) => e.status === "pending")) throw new Error("No pending photos. Select retry failed photos if needed.");
    job.state = "running";
    delete job.error;
    this.active.add(id);
    this.pauseRequested.delete(id);
    try { await this.save(job); }
    catch (error) { this.active.delete(id); job.state = "paused"; throw error; }
    void this.run(job, limit === 5 ? 5 : Infinity).catch(async (error: unknown) => {
      for (const entry of job.entries) if (entry.status === "processing") {
        entry.status = entry.cloudInFlight ? "failed" : "pending";
        if (entry.cloudInFlight) entry.error = "Interrupted during a paid request. Check API usage before retrying.";
        entry.cloudInFlight = false;
      }
      job.state = "paused"; job.error = messageOf(error);
      await this.save(job).catch(() => {});
    }).finally(() => { this.active.delete(id); this.pauseRequested.delete(id); });
    return job;
  }

  async pause(id: string) {
    const job = await this.get(id);
    if (job.state !== "running") throw new Error("This job is not running");
    this.pauseRequested.add(id);
    job.error = "Pause requested. Finishing the current photo before stopping.";
    await this.save(job);
    return job;
  }

  private async run(job: PhotoRepairJob, limit: number) {
    const zip = await openPhotoArchive(this.archive(job.id));
    try {
      const entries = await archiveEntries(zip);
      let processed = 0;
      for (const entry of job.entries) {
        if (entry.status !== "pending") continue;
        if (this.pauseRequested.has(job.id) || processed >= limit) break;
        const disk = await statfs(this.root);
        if (disk.bavail * disk.bsize < Math.max(512 * 1024 ** 2, entry.bytes * 4)) throw new Error("Server disk space is low. Free space before resuming.");
        const source = path.join(this.directory(job.id), "current.input");
        entry.status = "processing";
        entry.repaired = false; entry.review = false; entry.rotation = 0;
        delete entry.error;
        await this.save(job);
        try {
          await extractPhoto(zip, entries[entry.id], source);
          const output = this.output(job, entry);
          const dimensions = await localPhoto({ input: source, output, before: this.preview(job.id, entry.id, "before"), options: job.options });
          entry.width = dimensions.width; entry.height = dimensions.height;
          if ((job.options.orientation === "scene" || job.options.repair === "auto") && !entry.analysis) {
            entry.cloudInFlight = true; job.analysisAttempts++;
            await this.save(job);
            const sample = await sharp(output).resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
            entry.analysis = await this.cloud.assess(sample);
            entry.cloudInFlight = false;
            await this.save(job);
          }
          const analysis = entry.analysis;
          const rotation = job.options.orientation === "scene" && analysis && analysis.confidence >= 0.85 ? analysis.rotation : 0;
          entry.rotation = rotation;
          entry.review = Boolean(job.options.orientation === "scene" && analysis && analysis.confidence < 0.85);
          entry.note = analysis?.note;
          if (rotation) await this.rotateFile(output, rotation, job.options.format);
          if (job.options.repair === "all" || (job.options.repair === "auto" && analysis?.damaged)) {
            if (job.repairAttempts >= job.options.maxRepairs) {
              entry.status = "pending";
              throw new CloudPhotoError("Paid repair attempt limit reached. Raise the limit to continue. Completed photos and assessments are saved.");
            }
            const sample = await sharp(output).resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 95 }).toBuffer();
            entry.cloudInFlight = true; job.repairAttempts++;
            await this.save(job);
            const repaired = await this.cloud.restore(sample);
            const target = `${output}.tmp`;
            await sharp(repaired, { limitInputPixels: 60_000_000 }).toFormat(job.options.format, job.options.format === "png" ? {} : { quality: 95 }).toFile(target);
            await rename(target, output);
            entry.cloudInFlight = false;
            entry.repaired = true;
            entry.review = true;
          }
          const metadata = await sharp(output).metadata();
          entry.width = metadata.width; entry.height = metadata.height;
          await sharp(output).resize(1000, 850, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(this.preview(job.id, entry.id, "after"));
          entry.status = "done";
        } catch (error) {
          const wasPaid = entry.cloudInFlight;
          entry.cloudInFlight = false;
          if (entry.status !== "pending") { entry.status = "failed"; entry.error = messageOf(error); }
          if (error instanceof CloudPhotoError || wasPaid || (error as NodeJS.ErrnoException)?.code === "ENOSPC") {
            job.error = messageOf(error); job.state = "paused";
            await this.save(job);
            return;
          }
        } finally { await rm(source, { force: true }); }
        processed++;
        await this.save(job);
      }
      job.state = job.entries.some((e) => e.status === "pending") ? "paused" : "complete";
      if (processed >= limit && job.state === "paused") job.error = "Five-photo trial finished. Review the results, then process the remaining photos.";
      else delete job.error;
      await this.save(job);
    } finally { zip.close(); }
  }

  private async rotateFile(file: string, rotation: RepairRotation, format: RepairOptions["format"]) {
    const target = `${file}.tmp`;
    await sharp(file).rotate(rotation).toFormat(format, format === "png" ? {} : { quality: 95 }).toFile(target);
    await rename(target, file);
  }

  async rotate(id: string, entryId: number, rotation: unknown) {
    const job = await this.get(id);
    if (this.active.has(id) || this.exporting.has(id)) throw new Error("Pause processing and finish downloads before rotating a photo");
    if (![90, 180, 270].includes(Number(rotation)) || typeof rotation !== "number") throw new Error("Choose a quarter or half turn");
    const entry = job.entries.find((e) => e.id === entryId && e.status === "done");
    if (!entry) throw new Error("Completed photo not found");
    const edit = entry.manual || defaultManualEdit();
    return this.edit(id, entryId, { ...edit, rotation: (edit.rotation + rotation) % 360 }, entry.editVersion || 0);
  }

  async edit(id: string, entryId: number, value: unknown, expectedVersion: unknown) {
    const job = await this.get(id);
    if (this.active.has(id) || this.exporting.has(id)) throw new Error("Pause this job and finish downloads before saving manual edits");
    const entry = job.entries.find((e) => e.id === entryId && e.status === "done");
    if (!entry) throw new Error("Completed photo not found");
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== (entry.editVersion || 0)) throw new Error("This photo changed in another session. Reload it before saving.");
    const edit = manualPhotoEdit(value);
    const version = (entry.editVersion || 0) + 1;
    const next = { ...entry, editVersion: version };
    const target = this.output(job, next);
    const preview = this.resultPreview(job, next);
    const previous = { ...entry };
    let committed = false;
    this.active.add(id);
    try {
      // The original batch result is retained at version zero. Every edit renders from it.
      const base = this.output(job, { ...entry, editVersion: 0 });
      const reset = JSON.stringify(edit) === JSON.stringify(defaultManualEdit());
      let dimensions: { width?: number; height?: number };
      if (reset) {
        // Restoring the batch result copies its exact bytes, including for JPEG.
        dimensions = await sharp(base).metadata();
        await copyFile(base, `${target}.tmp`);
        await copyFile(this.preview(job.id, entry.id, "after"), `${preview}.tmp`);
      } else {
        dimensions = await localPhoto({ input: base, output: `${target}.tmp`, options: job.options, manual: edit, analysis: await this.cachedColorAnalysis(job, entry) });
        await sharp(`${target}.tmp`).resize(1000, 850, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(`${preview}.tmp`);
      }
      await rename(`${target}.tmp`, target);
      await rename(`${preview}.tmp`, preview);
      entry.rotation = ((entry.rotation - (entry.manual?.rotation || 0) + edit.rotation + 360) % 360) as RepairRotation;
      entry.manual = edit; entry.editVersion = version; entry.width = dimensions.width; entry.height = dimensions.height;
      entry.review = false; entry.reviewedAt = new Date().toISOString();
      await this.save(job);
      committed = true;
      if (previous.editVersion) {
        await rm(this.output(job, previous), { force: true }).catch(() => {});
        await rm(this.resultPreview(job, previous), { force: true }).catch(() => {});
      }
      return job;
    } finally {
      if (!committed) {
        // A failed render/save never changes the image selected by the job manifest.
        for (const key of Object.keys(entry)) delete (entry as unknown as Record<string, unknown>)[key];
        Object.assign(entry, previous);
        await rm(target, { force: true }).catch(() => {});
        await rm(preview, { force: true }).catch(() => {});
      }
      await rm(`${target}.tmp`, { force: true }).catch(() => {});
      await rm(`${preview}.tmp`, { force: true }).catch(() => {});
      this.active.delete(id);
    }
  }

  private colorAnalysisPath(job: PhotoRepairJob, entry: PhotoRepairEntry) {
    return path.join(this.directory(job.id), `${entry.id}.color-analysis.json`);
  }

  private async cachedColorAnalysis(job: PhotoRepairJob, entry: PhotoRepairEntry): Promise<ColorAnalysis | undefined> {
    try { return JSON.parse(await readFile(this.colorAnalysisPath(job, entry), "utf8")) as ColorAnalysis; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }

  async measure(id: string, entryId: number, neutral: unknown) {
    const job = await this.get(id);
    const entry = job.entries.find((e) => e.id === entryId && e.status === "done");
    if (!entry) throw new Error("Completed photo not found");
    // Reuse the edit validator for normalized, unrotated coordinates.
    const spot = manualPhotoEdit({ ...defaultManualEdit(), neutral: neutral ?? null }).neutral;
    // The retained batch raster is immutable, so review can load while other photos process.
    // Serialize measurements per job to bound memory and keep cache writes consistent.
    const result = (this.measurements.get(id) || Promise.resolve()).then(async () => {
      const analysis = await this.cachedColorAnalysis(job, entry);
      if (analysis && !spot) return { analysis, neutral: null };
      const result = await photoWorker<Awaited<ReturnType<typeof measureLocalPhoto>>>({
        input: this.output(job, { ...entry, editVersion: 0 }), measure: true, analysis, neutral: spot,
      });
      if (!analysis) {
        const file = this.colorAnalysisPath(job, entry);
        await writeFile(`${file}.tmp`, JSON.stringify(result.analysis));
        await rename(`${file}.tmp`, file);
      }
      return result;
    });
    const settled = result.then(() => {}, () => {});
    this.measurements.set(id, settled);
    try { return await result; }
    finally { if (this.measurements.get(id) === settled) this.measurements.delete(id); }
  }

  async remove(id: string) {
    const job = await this.get(id);
    if (job.state === "indexing" || this.active.has(id) || this.uploads.has(id) || this.exporting.has(id) || this.measurements.has(id)) throw new Error("Pause this job and finish indexing/uploads/downloads/review loading before deleting it");
    await this.writes.get(id);
    // directory() validates the UUID and fixes it directly below the configured root.
    const target = this.directory(id);
    if (path.dirname(target) !== this.root) throw new Error("Invalid job directory");
    await rm(target, { recursive: true, force: true });
    this.jobs.delete(id);
  }

  async approve(id: string, entryId: number) {
    const job = await this.get(id);
    if (this.active.has(id) || this.exporting.has(id)) throw new Error("Pause this job before approving a result");
    const entry = job.entries.find((e) => e.id === entryId && e.status === "done");
    if (!entry) throw new Error("Completed photo not found");
    entry.review = false;
    entry.reviewedAt = new Date().toISOString();
    await this.save(job);
    return job;
  }

  beginDownload(id: string) {
    if (this.active.has(id) || this.exporting.has(id)) throw new Error("Pause this job and finish the current photo/download before exporting");
    this.exporting.add(id);
    return () => { this.exporting.delete(id); };
  }
}

export const photoJobs = new PhotoJobStore();

/** Small control messages only. Archive chunks bypass JSON entirely. */
export async function photoJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += part.length;
    if (bytes > 16_384) throw new Error("Photo job command is too large");
    chunks.push(part);
  }
  const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Expected a JSON object");
  return data as Record<string, unknown>;
}
