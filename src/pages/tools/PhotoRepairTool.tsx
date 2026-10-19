import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PhotoReviewWorkbench } from "../../components/PhotoReviewWorkbench";
import { DEFAULT_REPAIR_OPTIONS, repairBytes, usesCloud, type PhotoRepairConfig, type PhotoRepairJob, type RepairOptions } from "../../lib/photoRepair";

const BASE = "/api/photo-repair";
const STORAGE_KEY = "webtools-photo-repair-job";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Photo request failed");
  return data;
}

function command<T>(id: string, action: string, body: unknown = {}) {
  return request<T>(`${BASE}/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function savedJob() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } }

export function PhotoRepairTool() {
  const [config, setConfig] = useState<PhotoRepairConfig | null>(null);
  const [jobs, setJobs] = useState<PhotoRepairJob[]>([]);
  const [job, setJob] = useState<PhotoRepairJob | null>(null);
  const [options, setOptions] = useState<RepairOptions>({ ...DEFAULT_REPAIR_OPTIONS });
  const [cloudConsent, setCloudConsent] = useState(false);
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reviewDirty, setReviewDirty] = useState(false);
  const uploadController = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedJobId = job?.id;
  const running = job?.state === "running";
  const locked = Boolean(job && (job.entries.some((e) => e.status !== "pending") || job.analysisAttempts || job.repairAttempts));
  const cloud = usesCloud(options);
  const done = job?.entries.filter((e) => e.status === "done").length || 0;
  const failed = job?.entries.filter((e) => e.status === "failed").length || 0;
  const review = job?.entries.filter((e) => e.review && e.status === "done").length || 0;
  const pending = job?.entries.filter((e) => e.status === "pending").length || 0;

  function selectJob(value: PhotoRepairJob | null) {
    setJob(value); setOptions(value?.options || { ...DEFAULT_REPAIR_OPTIONS });
    setReviewDirty(false); setRetry(false); setCloudConsent(false); setError("");
    try { if (value) localStorage.setItem(STORAGE_KEY, value.id); else localStorage.removeItem(STORAGE_KEY); } catch { /* Optional convenience. */ }
  }

  async function refreshJobs() {
    const data = await request<{ jobs: PhotoRepairJob[] }>(BASE);
    setJobs(data.jobs);
    return data.jobs;
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([request<PhotoRepairConfig>(`${BASE}/config`), request<{ jobs: PhotoRepairJob[] }>(BASE)])
      .then(([settings, data]) => {
        if (cancelled) return;
        setConfig(settings); setJobs(data.jobs);
        selectJob(data.jobs.find((j) => j.id === savedJob()) || data.jobs[0] || null);
      }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not connect to photo processing"); });
    return () => { cancelled = true; uploadController.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!selectedJobId || busy) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await request<PhotoRepairJob>(`${BASE}/${selectedJobId}`);
        if (!cancelled) {
          setJob(current);
          setJobs((list) => list.map((j) => j.id === current.id ? current : j));
        }
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not refresh this job"); }
      if (!cancelled) timer = setTimeout(poll, running ? 2000 : 6000);
    };
    timer = setTimeout(poll, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [selectedJobId, running, busy]);

  function change<K extends keyof RepairOptions>(key: K, value: RepairOptions[K]) { setOptions((o) => ({ ...o, [key]: value })); }

  async function upload(file: File) {
    if (!config || busy || reviewDirty) return;
    setError("");
    if (!/\.zip$/i.test(file.name) || file.size > config.maxArchiveBytes || file.size < 22) { setError("Choose a non-empty ZIP up to 8 GB."); return; }
    const controller = new AbortController();
    uploadController.current = controller;
    setBusy("Uploading ZIP");
    let current = job;
    try {
      if (current?.state === "uploading") {
        if (current.name !== file.name || current.size !== file.size) throw new Error("To resume, choose the same original ZIP with the same name and size. Use New archive for a different ZIP.");
        current = await request<PhotoRepairJob>(`${BASE}/${current.id}`);
      } else {
        current = await request<PhotoRepairJob>(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }), signal: controller.signal });
        selectJob(current);
        setJobs((list) => [current!, ...list]);
      }
      while (current.uploaded < file.size) {
        const end = Math.min(current.uploaded + config.chunkBytes, file.size);
        const result: { uploaded: number } = await request<{ uploaded: number }>(`${BASE}/${current.id}/upload?offset=${current.uploaded}`, {
          method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file.slice(current.uploaded, end), signal: controller.signal,
        });
        current = { ...current, uploaded: result.uploaded };
        setJob(current);
      }
      if (controller.signal.aborted) return;
      setBusy("Reading ZIP directory");
      const indexed = await command<PhotoRepairJob>(current.id, "finalize");
      selectJob(indexed);
      await refreshJobs();
    } catch (caught) {
      setError(controller.signal.aborted ? "Upload paused. Reselect the same ZIP to resume from the saved byte." : caught instanceof Error ? caught.message : "Upload failed. Reselect the same ZIP to resume.");
    } finally { setBusy(""); uploadController.current = null; }
  }

  async function act(action: "start" | "pause", body: unknown = {}) {
    if (!job || busy || (reviewDirty && action === "start")) return;
    setBusy(action === "start" ? "Starting job" : "Pausing job"); setError("");
    try {
      const updated = await command<PhotoRepairJob>(job.id, action, body);
      setJob(updated); setOptions(updated.options);
      setJobs((list) => list.map((j) => j.id === updated.id ? updated : j));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update this job"); }
    finally { setBusy(""); }
  }

  async function deleteJob() {
    if (!job || busy || running || reviewDirty) return;
    setBusy("Removing job"); setError("");
    try {
      await request(`${BASE}/${job.id}`, { method: "DELETE" });
      const remaining = await refreshJobs(); selectJob(remaining[0] || null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not remove job"); }
    finally { setBusy(""); }
  }

  function updateReviewedJob(updated: PhotoRepairJob) {
    setJob(updated); setJobs((list) => list.map((item) => item.id === updated.id ? updated : item));
  }

  const canStart = Boolean(job && !busy && !reviewDirty && !running && ["ready", "paused", "complete"].includes(job.state)
    && (pending || (failed && retry)) && (!cloud || (config?.cloudAvailable && cloudConsent)));

  return <>
    <header className="tool-head">
      <span className="badge network">This server · optional cloud AI</span>
      <h1>Bulk photo repair</h1>
      <p className="lede">Restore a ZIP of scanned photos, correct color, and put each image upright. Keep your originals and download an edited copy of every completed photo.</p>
    </header>
    <div className="workspace repair-workspace">
      <div className="stack">
        <section className="panel repair-intake">
          <div className="row repair-between"><h2>1. Add your archive</h2><Link className="btn ghost small" to="/photo-color">Single photo color fix</Link></div>
          <p className="repair-muted">ZIPs up to {config ? repairBytes(config.maxArchiveBytes) : "8 GB"} · up to {config?.maxPhotos.toLocaleString() || "5,000"} photos · JPEG, PNG, TIFF, WebP and more</p>
          <label className={`drop repair-drop${busy ? " repair-disabled" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && !busy && !running && !reviewDirty) void upload(file); }}>
            <input ref={fileInput} className="hidden-file" type="file" accept=".zip,application/zip" disabled={Boolean(busy) || running || !config || reviewDirty}
              onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
            <strong>{job?.state === "uploading" ? "Choose the same ZIP to resume upload" : "Drop your photo ZIP here"}</strong>
            <span>or click to browse · large archives stream to server storage</span>
          </label>
          {busy === "Uploading ZIP" && job && <div className="stack">
            <progress aria-label="ZIP upload progress" max={job.size} value={job.uploaded} />
            <div className="row repair-between"><span>{repairBytes(job.uploaded)} of {repairBytes(job.size)}</span><button className="btn ghost small" onClick={() => uploadController.current?.abort()}>Pause upload</button></div>
          </div>}
          {jobs.length > 0 && <label className="field repair-job-picker"><span>Saved jobs on this server</span>
            <select aria-label="Saved photo jobs" value={job?.id || ""} disabled={Boolean(busy) || reviewDirty} onChange={(event) => selectJob(jobs.find((j) => j.id === event.target.value) || null)}>
              <option value="">New archive</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.name} · {j.state} · {new Date(j.createdAt).toLocaleDateString()}</option>)}
            </select></label>}
          {job && <p className="repair-muted">{job.name} · {repairBytes(job.size)}{job.entries.length > 0 ? ` · ${job.entries.length.toLocaleString()} photos · ${job.ignored} other files skipped` : ""}</p>}
        </section>

        <section className="panel stack">
          <h2>2. Choose the restoration</h2>
          <div className="repair-options">
            <label className="field"><span>Color correction</span><select disabled={locked || Boolean(busy)} value={options.color ? "on" : "off"} onChange={(e) => change("color", e.target.value === "on")}>
              <option value="on">Auto balance · per photo</option><option value="off">Keep original color</option></select></label>
            <label className="field"><span>Correction strength · {options.strength}%</span><input type="range" min="0" max="100" value={options.strength} disabled={locked || !options.color || Boolean(busy)} onChange={(e) => change("strength", Number(e.target.value))} /></label>
            <label className="field"><span>Orientation</span><select disabled={locked || Boolean(busy)} value={options.orientation} onChange={(e) => change("orientation", e.target.value as RepairOptions["orientation"])}>
              <option value="metadata">EXIF metadata · CPU</option><option value="scene" disabled={!config?.cloudAvailable}>Detect upright · cloud AI</option></select></label>
            <label className="field"><span>Scratches, creases and negative damage</span><select disabled={locked || Boolean(busy)} value={options.repair} onChange={(e) => change("repair", e.target.value as RepairOptions["repair"])}>
              <option value="off">Skip physical repair</option><option value="auto" disabled={!config?.cloudAvailable}>Detected damage · AI</option><option value="all" disabled={!config?.cloudAvailable}>Every photo · cloud AI</option></select></label>
            <label className="field"><span>Output format</span><select disabled={locked || Boolean(busy)} value={options.format} onChange={(e) => change("format", e.target.value as RepairOptions["format"])}>
              <option value="jpeg">JPEG · 95% quality</option><option value="png">PNG · lossless encoding</option><option value="webp">WebP · 95% quality</option></select></label>
            <label className="field"><span>Maximum paid repair attempts per job</span><input type="number" min="0" max="5000" step="1" value={options.maxRepairs} disabled={Boolean(busy) || running} onChange={(e) => change("maxRepairs", Number(e.target.value))} /></label>
          </div>
          {locked && <p className="repair-muted">Settings stay fixed after the first run so the batch is consistent. You can raise the repair limit. Use a new job to change the other settings.</p>}
          <div className="repair-explainer">
            <strong>{config?.cloudAvailable ? "Cloud AI is connected" : "CPU processing is ready; cloud AI needs setup"}</strong>
            <p>Color correction runs on this server and keeps original pixel dimensions. EXIF orientation follows saved metadata; scene detection can recognize sideways scans without it. Uncertain rotations are left unchanged and flagged for review.</p>
            <p>AI repair sends photo copies to OpenAI and is billed per request. It can change fine details and output dimensions, so review repaired faces and text. Every AI repair is flagged for review. The repair limit counts attempts, including failed requests; scene/damage assessments are billed separately, at most once per photo unless an assessment fails.</p>
            {!config?.cloudAvailable && <p>To enable cloud repair and scene detection, set <code>OPENAI_API_KEY</code> in the server environment and restart. API keys stay on the server.</p>}
          </div>
          {cloud && <label className="check"><input type="checkbox" checked={cloudConsent} disabled={running} onChange={(e) => setCloudConsent(e.target.checked)} />Allow paid cloud requests for this run: {options.repair !== "off" ? `up to ${Math.max(0, options.maxRepairs - (job?.repairAttempts || 0))} more repair attempts` : "no image repairs"}{options.orientation === "scene" || options.repair === "auto" ? ", plus scene/damage assessment for each photo that needs it" : ""}.</label>}
          {failed > 0 && <label className="check"><input type="checkbox" checked={retry} onChange={(e) => setRetry(e.target.checked)} disabled={running} />Retry {failed} failed photo{failed === 1 ? "" : "s"}. Paid requests may be charged again.</label>}
          <div className="row">
            {!locked && <button className="btn ghost" disabled={!job || !pending || Boolean(busy) || running || reviewDirty || job.state !== "ready"} onClick={() => void act("start", { options: { ...options, color: false, orientation: "metadata", repair: "off" }, limit: "all", retry: false, cloudConsent: false })}>Prepare for manual review</button>}
            <button className="btn" disabled={!canStart} onClick={() => void act("start", { options, limit: 5, retry, cloudConsent })}>Try 5 photos</button>
            <button className="btn ghost" disabled={!canStart} onClick={() => void act("start", { options, limit: "all", retry, cloudConsent })}>Process remaining photos</button>
            {running && <button className="btn ghost" disabled={Boolean(busy)} onClick={() => void act("pause")}>Pause after current photo</button>}
          </div>
          {!locked && <p className="repair-muted">Prefer to correct everything yourself? Prepare for manual review keeps the scanned colors and uses no cloud AI. Then use the reviewer below.</p>}
          <p className="repair-muted">Jobs continue when this tab closes. After a server restart, resume explicitly. Original files stay in the uploaded ZIP; edited files use <code>originalname_edited.jpg</code> and keep their folders.</p>
        </section>
      </div>

      <div className="stack">
        <section className="panel stack repair-status" aria-live="polite">
          <div className="row repair-between"><h2>3. Review &amp; download</h2><span className="badge">{job?.state || "No archive yet"}</span></div>
          {error && <p className="repair-error" role="alert">{error}</p>}
          {busy && <p className="repair-muted">{busy}…</p>}
          {job?.error && <p className="repair-notice">{job.error}</p>}
          <div className="repair-stats"><div><strong>{done}</strong><span>Completed</span></div><div><strong>{pending}</strong><span>Waiting</span></div><div><strong>{review}</strong><span>To review</span></div><div><strong>{failed}</strong><span>Failed</span></div></div>
          {job && job.entries.length > 0 && <><progress aria-label="Photo processing progress" max={job.entries.length} value={done + failed} />
            <p className="repair-muted">{done + failed} of {job.entries.length} processed · {job.repairAttempts} repair attempts · {job.analysisAttempts} assessments</p>
            {running && <p className="repair-muted repair-current">Processing: {job.entries.find((e) => e.status === "processing")?.source || "Preparing next photo…"}</p>}
          </>}
          <div className="row">
            {done > 0 && <button className="btn" onClick={() => { document.getElementById("photo-review")?.scrollIntoView({ behavior: "smooth", block: "start" }); document.getElementById("photo-review")?.focus({ preventScroll: true }); }}>Review &amp; correct photos</button>}
            {job && done > 0 && !running && !busy && !reviewDirty && <a className="btn ghost" href={`${BASE}/${job.id}/download`}>Download {done} edited photos</a>}
          {job && !running && <button className="btn ghost small" disabled={Boolean(busy) || reviewDirty || job.state === "indexing"} onClick={() => void deleteJob()}>Delete job from server</button>}
          </div>
          <p className="repair-muted">Download includes completed photos and a JSON processing report. Failed and unprocessed photos are listed in the report. Deleting a job removes its uploaded ZIP and results from this server.</p>
        </section>

        <section className="panel stack"><h2>Manual review, at your pace</h2><p className="repair-muted">Open a completed photo in the reviewer below. Rotate with L / R, adjust the live color sliders or pick a gray/white spot, then press Enter to save and move on. Use Focus view for a larger workspace.</p>
          {reviewDirty && <p className="repair-notice">Save or discard the current changes before changing jobs, starting a batch, or downloading the ZIP.</p>}
        </section>
      </div>

      {job && job.entries.length > 0 && <PhotoReviewWorkbench key={job.id} job={job} disabled={Boolean(busy)} readOnly={running} onJobChange={updateReviewedJob} onBusyChange={setBusy} onDirtyChange={setReviewDirty} />}
    </div>
  </>;
}
