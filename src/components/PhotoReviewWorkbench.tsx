import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ADJUSTMENT_RANGES, correctPixels, neutralizeSample, type ColorAdjustments, type ColorAnalysis, type RgbColor } from "../lib/photoColor";
import { defaultManualEdit, type ManualPhotoEdit, type PhotoRepairJob, type RepairRotation } from "../lib/photoRepair";
import { loadImage } from "../lib/image";

const BASE = "/api/photo-repair";
const PAGE_SIZE = 40;
const SLIDERS: { key: keyof ColorAdjustments; label: string; ends: string }[] = [
  { key: "strength", label: "Auto balance", ends: "Off → full correction" },
  { key: "warmth", label: "Warmth", ends: "Cooler → warmer" },
  { key: "tint", label: "Tint", ends: "Green → magenta" },
  { key: "brightness", label: "Brightness", ends: "Darker → lighter" },
  { key: "contrast", label: "Contrast", ends: "Softer → stronger" },
  { key: "saturation", label: "Saturation", ends: "Muted → vivid" },
];

function copyEdit(edit?: ManualPhotoEdit) { return edit ? { ...edit, adjustments: { ...edit.adjustments }, neutral: edit.neutral ? { ...edit.neutral } : null } : defaultManualEdit(); }
function rememberedPhoto(jobId: string) { try { return Number(localStorage.getItem(`webtools-photo-review-${jobId}`) ?? -1); } catch { return -1; } }

type Props = {
  job: PhotoRepairJob;
  disabled: boolean;
  readOnly: boolean;
  onJobChange(job: PhotoRepairJob): void;
  onBusyChange(message: string): void;
  onDirtyChange(dirty: boolean): void;
};

export function PhotoReviewWorkbench({ job, disabled, readOnly, onJobChange, onBusyChange, onDirtyChange }: Props) {
  const [selectedId, setSelectedId] = useState(() => rememberedPhoto(job.id));
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [jump, setJump] = useState("");
  const [focus, setFocus] = useState(false);
  const [view, setView] = useState<"edited" | "compare" | "original">("edited");
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<ManualPhotoEdit>(defaultManualEdit);
  const [saved, setSaved] = useState<ManualPhotoEdit>(defaultManualEdit);
  const [version, setVersion] = useState(0);
  const [frame, setFrame] = useState<{ key: string; pixels: ImageData; analysis: ColorAnalysis } | null>(null);
  const [neutralSample, setNeutralSample] = useState<{ key: string; spot: string; color: RgbColor } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const working = useRef(false);
  const loadedKey = useRef("");
  const dirtyRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const completed = job.entries.filter((entry) => entry.status === "done");
  const photos = completed.filter((entry) => filter === "all" || (filter === "unreviewed" ? !entry.reviewedAt : entry.review));
  const selected = completed.find((entry) => entry.id === selectedId) || photos[0] || completed[0];
  const key = selected ? `${job.id}:${selected.id}` : "";
  const index = selected ? photos.findIndex((entry) => entry.id === selected.id) : -1;
  const overallIndex = selected ? completed.findIndex((entry) => entry.id === selected.id) : -1;
  const pages = Math.max(1, Math.ceil(photos.length / PAGE_SIZE));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  dirtyRef.current = dirty;
  const ready = Boolean(selected && frame && frame.key === key);
  const needsSample = Boolean(draft.neutral && (neutralSample?.key !== key || neutralSample.spot !== JSON.stringify(draft.neutral)));
  const editable = ready && !needsSample && !disabled && !readOnly && !saving;
  const reviewed = completed.filter((entry) => entry.reviewedAt).length;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    const position = photos.findIndex((entry) => entry.id === selected?.id);
    if (position >= 0) setPage(Math.floor(position / PAGE_SIZE));
  }, [selected?.id, filter]);

  useEffect(() => {
    if (!selected) return;
    if (loadedKey.current === key && dirtyRef.current) return;
    loadedKey.current = key;
    const edit = copyEdit(selected.manual);
    setDraft(edit); setSaved(copyEdit(edit)); setVersion(selected.editVersion || 0);
    setPicking(false); setError(""); setMessage("");
    try { localStorage.setItem(`webtools-photo-review-${job.id}`, String(selected.id)); } catch { /* Optional convenience. */ }
  }, [key, selected?.editVersion, dirty]);

  useEffect(() => {
    if (!selected) { setFrame(null); return; }
    const controller = new AbortController();
    let cancelled = false;
    setFrame(null);
    const photoUrl = `${BASE}/${job.id}/photos/${selected.id}`;
    Promise.all([
      fetch(`${photoUrl}/edit-base`, { signal: controller.signal }),
      fetch(`${photoUrl}/measure`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ neutral: selected.manual?.neutral || null }), signal: controller.signal })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Could not measure this photo");
          return result as { analysis: ColorAnalysis; neutral: RgbColor | null };
        }),
    ]).then(async ([response, measured]) => {
        if (!response.ok) throw new Error("Could not load this photo for review");
        const blob = await response.blob();
        const image = await loadImage(new File([blob], "review.jpg", { type: "image/jpeg" }));
        try {
          if (cancelled) return;
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("Canvas is not available");
          context.drawImage(image, 0, 0);
          setFrame({ key, pixels: context.getImageData(0, 0, canvas.width, canvas.height), analysis: measured.analysis });
          setNeutralSample(measured.neutral ? { key, spot: JSON.stringify(selected.manual?.neutral), color: measured.neutral } : null);
          canvas.width = 0; canvas.height = 0;
        } finally { image.removeAttribute("src"); }
      }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load photo"); });
    return () => { cancelled = true; controller.abort(); };
  }, [key]);

  useEffect(() => {
    if (!ready || !needsSample || !draft.neutral) return;
    const controller = new AbortController();
    let cancelled = false;
    const spot = JSON.stringify(draft.neutral);
    fetch(`${BASE}/${job.id}/photos/${selected!.id}/measure`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ neutral: draft.neutral }), signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not sample this photo");
        if (!cancelled) setNeutralSample({ key, spot, color: result.neutral as RgbColor });
      }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not sample photo"); });
    return () => { cancelled = true; controller.abort(); };
  }, [ready, key, draft.neutral, needsSample]);

  useEffect(() => {
    if (!ready || !frame || needsSample) return;
    const handle = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scratch = document.createElement("canvas");
      scratch.width = frame.pixels.width; scratch.height = frame.pixels.height;
      try {
        const context = scratch.getContext("2d");
        if (!context) throw new Error("Canvas is not available");
        const corrected = new ImageData(scratch.width, scratch.height);
        const analysis = draft.neutral && neutralSample ? neutralizeSample(frame.analysis, neutralSample.color) : frame.analysis;
        correctPixels(frame.pixels.data, analysis, draft.adjustments, corrected.data);
        context.putImageData(corrected, 0, 0);
        const sideways = draft.rotation === 90 || draft.rotation === 270;
        canvas.width = sideways ? scratch.height : scratch.width;
        canvas.height = sideways ? scratch.width : scratch.height;
        const output = canvas.getContext("2d");
        if (!output) throw new Error("Canvas is not available");
        output.translate(canvas.width / 2, canvas.height / 2);
        output.rotate(draft.rotation * Math.PI / 180);
        output.drawImage(scratch, -scratch.width / 2, -scratch.height / 2);
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not preview adjustments"); }
      finally { scratch.width = 0; scratch.height = 0; }
    });
    return () => cancelAnimationFrame(handle);
  }, [ready, frame, neutralSample, needsSample, draft, view]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!focus) return;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    sectionRef.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = previous; previousFocus?.focus({ preventScroll: true }); };
  }, [focus]);

  function rotate(degrees: number) {
    if (!editable) return;
    setDraft((edit) => ({ ...edit, rotation: ((edit.rotation + degrees) % 360) as RepairRotation }));
    setMessage(""); setView((current) => current === "original" ? "edited" : current);
  }

  function adjust(name: keyof ColorAdjustments, value: number) {
    setDraft((edit) => ({ ...edit, adjustments: { ...edit.adjustments, [name]: value } }));
    setMessage(""); setView((current) => current === "original" ? "edited" : current);
  }

  async function persist(markReviewed: boolean) {
    if (!selected || working.current || disabled || readOnly || !ready || needsSample) return false;
    if (!dirty && (!markReviewed || selected.reviewedAt)) return true;
    working.current = true; setSaving(true); onBusyChange("Saving photo"); setError("");
    try {
      const endpoint = dirty ? "edit" : "approve";
      const response = await fetch(`${BASE}/${job.id}/photos/${selected.id}/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edit: draft, version }),
      });
      const updated = await response.json() as PhotoRepairJob & { error?: string };
      if (!response.ok) throw new Error(updated.error || "Could not save this photo");
      const entry = updated.entries.find((entry) => entry.id === selected.id)!;
      dirtyRef.current = false;
      setSaved(copyEdit(draft)); setVersion(entry.editVersion || 0);
      onJobChange(updated); onDirtyChange(false);
      setMessage("Saved at full resolution");
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save photo"); return false; }
    finally { working.current = false; setSaving(false); onBusyChange(""); }
  }

  async function navigate(id: number) {
    if (working.current || disabled || id === selected?.id) return;
    if (dirty && !await persist(false)) return;
    setSelectedId(id); setPicking(false); setMessage("");
  }

  async function move(direction: number, approve = false) {
    if (working.current || disabled || !selected) return;
    const targetIndex = index < 0 ? (direction > 0 ? 0 : photos.length - 1) : index + direction;
    const target = photos[targetIndex];
    if (approve && !await persist(true)) return;
    if (target) {
      if (approve) { setSelectedId(target.id); setPicking(false); }
      else await navigate(target.id);
    }
    else if (approve) setMessage("Saved. You have reached the end of this review list.");
  }

  function pickNeutral(event: MouseEvent<HTMLCanvasElement>) {
    if (!picking || !editable || !frame) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const v = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const spot = draft.rotation === 90 ? { x: v, y: 1 - u } : draft.rotation === 180 ? { x: 1 - u, y: 1 - v }
      : draft.rotation === 270 ? { x: 1 - v, y: u } : { x: u, y: v };
    setDraft((edit) => ({ ...edit, neutral: spot, adjustments: { ...edit.adjustments, strength: 100 } }));
    setPicking(false); setMessage(""); setError("");
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPicking(false); setFocus(false); return; }
      if (event.key === "Tab" && focus && sectionRef.current) {
        const controls = [...sectionRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)")].filter((element) => element.getClientRects().length > 0);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === sectionRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sectionRef.current)) { event.preventDefault(); first?.focus(); }
        return;
      }
      const target = event.target as HTMLElement;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if ((event.key === "Enter" || event.key === " ") && target?.closest("button, a")) return;
      if (event.repeat && ["Enter", "l", "L", "r", "R"].includes(event.key)) return;
      if (!sectionRef.current || !selected || disabled || working.current || !ready) return;
      // Outside focus mode, shortcuts belong to the reviewer only while it is on screen.
      const bounds = sectionRef.current.getBoundingClientRect();
      if (!focus && (bounds.top >= window.innerHeight || bounds.bottom <= 0)) return;
      if (event.key === "ArrowRight") { event.preventDefault(); void move(1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); void move(-1); }
      else if (event.key.toLowerCase() === "r") { event.preventDefault(); rotate(90); }
      else if (event.key.toLowerCase() === "l") { event.preventDefault(); rotate(270); }
      else if (event.key === "Enter") { event.preventDefault(); void move(1, true); }
      else if (event.key === " ") { event.preventDefault(); setView((current) => current === "original" ? "edited" : "original"); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  async function changeFilter(value: string) {
    if (dirty && !await persist(false)) return;
    setFilter(value); setPage(0); setSelectedId(-1);
  }

  return <section ref={sectionRef} id="photo-review" className={`panel stack repair-full repair-review${focus ? " is-focus" : ""}`} tabIndex={-1} role={focus ? "dialog" : "region"} aria-modal={focus || undefined} aria-label="Manual photo review">
    <div className="repair-review-header stack">
      <div className="row repair-between"><div><h2>Review &amp; correct each photo</h2><p className="repair-muted">{reviewed} of {completed.length} reviewed · manual edits stay on this server</p></div>
        <button className="btn ghost small" onClick={() => setFocus((current) => !current)}>{focus ? "Exit focus view" : "Focus view"}</button></div>
      <div className="row repair-between">
        <div className="row"><button className="btn ghost" disabled={disabled || saving || index <= 0} onClick={() => void move(-1)}>← Previous photo</button>
          <span className="repair-review-position">{selected ? `${overallIndex + 1} / ${completed.length}` : "No completed photos"}</span>
          <button className="btn ghost" disabled={disabled || saving || (index >= 0 && index + 1 >= photos.length) || !photos.length} onClick={() => void move(1)}>Next photo →</button></div>
        <div className="row"><button className="btn ghost" disabled={!editable || (!dirty && Boolean(selected?.reviewedAt))} onClick={() => void persist(true)}>{saving ? "Saving…" : "Save photo"}</button>
          <button className="btn" disabled={!editable} onClick={() => void move(1, true)}>Save &amp; next ↵</button></div>
      </div>
      {selected && <div className="row repair-between"><p className="repair-filename">{selected.source}</p><span className="repair-muted" role="status">{dirty ? "Unsaved changes · saved when you move to another photo" : message || (selected.reviewedAt ? "Reviewed & saved" : "Ready to review")}</span>
        {dirty && <button className="btn ghost small" disabled={saving} onClick={() => { setDraft(copyEdit(saved)); setPicking(false); setError(""); }}>Discard changes</button>}</div>}
      {error && <p className="repair-error" role="alert">{error}</p>}
      {job.state === "running" && <p className="repair-notice">Pause the batch to save manual edits. You can browse completed results while it runs.</p>}
    </div>

    {selected ? <div className="repair-editor-layout">
      <div className="stack">
        <div className="row repair-between"><div className="segmented" aria-label="Photo comparison view">
          {([ ["edited", "Edited"], ["compare", "Side by side"], ["original", "Original"] ] as const).map(([value, label]) => <button key={value} className={view === value ? "on" : ""} aria-pressed={view === value} onClick={() => { setView(value); setPicking(false); }}>{label}</button>)}
        </div><div className="row"><button className="btn ghost small" disabled={!editable} onClick={() => rotate(270)}>↶ Rotate left · L</button><button className="btn ghost small" disabled={!editable} onClick={() => rotate(90)}>↷ Rotate right · R</button><button className="btn ghost small" disabled={!editable} onClick={() => rotate(180)}>180°</button></div></div>
        <div className={`repair-editor-stage${view === "compare" ? " comparing" : ""}`}>
          {view !== "edited" && <figure><img src={`${BASE}/${job.id}/photos/${selected.id}/before`} alt={`Original scan: ${selected.source}`} /><figcaption>Original scan</figcaption></figure>}
          <figure className={view === "original" ? "repair-editor-hidden" : ""}>
            {!dirty && !picking && <img src={`${BASE}/${job.id}/photos/${selected.id}/after?v=${selected.editVersion || 0}`} alt={`Saved photo: ${selected.source}`} />}
            {ready ? <canvas ref={canvasRef} style={!dirty && !picking ? { display: "none" } : undefined} className={picking ? "picking" : ""} aria-label={`Editable preview: ${selected.source}`} onClick={pickNeutral} /> : (dirty || picking) && <div className="repair-empty">Loading photo…</div>}
            {needsSample && <p className="repair-muted" role="status">Measuring gray spot on the full-resolution photo…</p>}
            <figcaption>{picking ? "Click something that should be gray or white. Esc cancels." : `Edited preview${selected.repaired ? " · AI restored" : ""} · ${selected.width} × ${selected.height} saved pixels`}</figcaption>
          </figure>
        </div>
        <p className="repair-muted repair-shortcuts"><kbd>←</kbd> <kbd>→</kbd> move · <kbd>L</kbd> / <kbd>R</kbd> rotate · <kbd>Enter</kbd> save &amp; next · <kbd>Space</kbd> original · <kbd>Esc</kbd> exit focus</p>
        {selected.review && <p className="repair-notice">{selected.repaired ? "Check the AI repair, especially faces and text, then save to mark this photo reviewed." : "Check the orientation, then save to mark this photo reviewed."}</p>}
        {selected.note && <p className="repair-muted">{selected.note}</p>}
      </div>
      <aside className="stack repair-editor-controls" aria-label="Photo color adjustments">
        <div className="row repair-between"><h3>Quick correction</h3><button className="btn ghost small" disabled={!editable} onClick={() => { setDraft(defaultManualEdit()); setPicking(false); setView("edited"); }}>Reset to batch result</button></div>
        <div className="row"><button className="btn ghost small" disabled={!editable} onClick={() => { setDraft((edit) => ({ ...edit, neutral: null, adjustments: { ...edit.adjustments, strength: 100 } })); setView("edited"); }}>Auto balance color</button>
          <button className="btn ghost small" disabled={!editable} aria-pressed={picking} onClick={() => { setPicking((current) => !current); setView("edited"); }}>Pick gray / white</button>
          {draft.neutral && <button className="btn ghost small" disabled={!ready || disabled || readOnly || saving} onClick={() => setDraft((edit) => ({ ...edit, neutral: null }))}>Clear gray spot</button>}</div>
        {SLIDERS.map(({ key: name, label, ends }) => <label key={name} className="field repair-adjustment"><span>{label}<output>{draft.adjustments[name] > 0 && name !== "strength" ? "+" : ""}{draft.adjustments[name]}{name === "strength" ? "%" : ""}</output></span>
          <input aria-label={label} type="range" min={ADJUSTMENT_RANGES[name][0]} max={ADJUSTMENT_RANGES[name][1]} value={draft.adjustments[name]} disabled={!editable} onChange={(event) => adjust(name, Number(event.target.value))} onDoubleClick={() => adjust(name, 0)} />
          <small>{ends}</small></label>)}
        <p className="repair-muted">Double-click a slider to reset it. Changes preview instantly and save at full resolution. Reset restores the retained batch result.</p>
        {!dirty && <a className="btn ghost small" href={`${BASE}/${job.id}/photos/${selected.id}/download`}>Download this photo</a>}
      </aside>
    </div> : <div className="repair-empty"><strong>Your photos will appear here</strong><p>Process a trial or batch, then review each completed photo. Choose CPU color/orientation processing to prepare a batch without cloud AI.</p></div>}

    {completed.length > 0 && <div className="stack repair-review-filmstrip">
      <div className="row repair-between"><label className="field"><span>Review list</span><select aria-label="Review list" value={filter} disabled={disabled || saving} onChange={(event) => void changeFilter(event.target.value)}>
        <option value="all">All completed photos</option><option value="unreviewed">Not yet reviewed</option><option value="flagged">Flagged for review</option></select></label>
        <form className="row repair-jump" onSubmit={(event) => { event.preventDefault(); const target = completed[Number(jump) - 1]; if (target) void navigate(target.id); }}>
          <label className="field"><span>Go to photo</span><input aria-label="Go to photo" type="number" min="1" max={completed.length} placeholder={String(overallIndex + 1)} value={jump} disabled={disabled || saving} onChange={(event) => setJump(event.target.value)} /></label>
          <button className="btn ghost small" disabled={disabled || saving || !jump}>Go</button></form>
      </div>
      <div className="repair-grid">{photos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((entry) => <button className="repair-card" key={entry.id} disabled={disabled || saving} aria-pressed={entry.id === selected?.id} onClick={() => void navigate(entry.id)}>
        <img loading="lazy" src={`${BASE}/${job.id}/photos/${entry.id}/after?v=${entry.editVersion || 0}`} alt="" />
        <strong title={entry.source}>{entry.source}</strong><span>{entry.reviewedAt ? "✓ Reviewed" : "Not reviewed"}{entry.review ? " · flagged" : ""}</span>
      </button>)}</div>
      {!photos.length && <p className="repair-muted">No photos match this review list.</p>}
      <div className="row repair-between"><span className="repair-muted">{photos.length} photos · page {Math.min(page + 1, pages)} of {pages}</span><div className="row"><button className="btn ghost small" disabled={page <= 0} onClick={() => setPage((value) => value - 1)}>Previous thumbnails</button><button className="btn ghost small" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>Next thumbnails</button></div></div>
    </div>}
    {job.entries.some((entry) => entry.status === "failed") && <details><summary>Photos that failed processing</summary><ul>{job.entries.filter((entry) => entry.status === "failed").map((entry) => <li key={entry.id}>{entry.source}: {entry.error}</li>)}</ul></details>}
  </section>;
}
