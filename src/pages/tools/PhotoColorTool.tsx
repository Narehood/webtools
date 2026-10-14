import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from "react";
import { assertImageDimensions, assertImageFile, fitImageDimensions } from "../../lib/fileImageTools";
import { canvasFromImage, downloadBlob, encodeCanvas, formatBytes, loadImage } from "../../lib/image";
import {
  DEFAULT_ADJUSTMENTS,
  analyzeColorCast,
  averageSample,
  buildPhotoZip,
  correctPixels,
  correctedFileName,
  neutralizeSample,
  photoOutputFormat,
  type ColorAdjustments,
  type ColorAnalysis,
  type PhotoOutputChoice,
  type RgbColor,
} from "../../lib/photoColor";

const MAX_PHOTOS = 100;
const MAX_PHOTO_BYTES = 80 * 1024 * 1024;
const ANALYSIS_PIXELS = 1_000_000;
const ANALYSIS_SIDE = 1600;
const PREVIEW_PIXELS = 2_400_000;
const PREVIEW_SIDE = 2000;
const THUMB_PIXELS = 40_000;
const THUMB_SIDE = 240;

type PhotoEntry = {
  id: string;
  file: File;
  width: number;
  height: number;
  analysis: ColorAnalysis;
  /** Small copy of the original pixels for the batch strip. */
  thumb: ImageData;
  adjustments: ColorAdjustments;
  /** Original color of a spot the user marked as gray, if any. */
  neutral: RgbColor | null;
};

type PreviewView = "after" | "split" | "before";

const SLIDERS: { key: Exclude<keyof ColorAdjustments, "strength">; label: string; left: string; right: string }[] = [
  { key: "warmth", label: "Warmth", left: "Bluer", right: "Yellower" },
  { key: "tint", label: "Tint", left: "Greener", right: "Magenta" },
  { key: "brightness", label: "Brightness", left: "Darker", right: "Lighter" },
  { key: "contrast", label: "Contrast", left: "Flatter", right: "Punchier" },
  { key: "saturation", label: "Saturation", left: "Muted", right: "Vivid" },
];

const VIEWS: { id: PreviewView; label: string }[] = [
  { id: "after", label: "Corrected" },
  { id: "split", label: "Split" },
  { id: "before", label: "Original" },
];

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function uniqueId() {
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(36)).join("-");
}

function signed(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function drawScaled(image: HTMLImageElement, maxPixels: number, maxSide: number) {
  const size = fitImageDimensions(image.naturalWidth, image.naturalHeight, maxPixels, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, size.width, size.height);
  return context.getImageData(0, 0, size.width, size.height);
}

function effectiveAnalysis(photo: PhotoEntry) {
  return photo.neutral ? neutralizeSample(photo.analysis, photo.neutral) : photo.analysis;
}

async function renderCorrected(photo: PhotoEntry, choice: PhotoOutputChoice) {
  const image = await loadImage(photo.file);
  const { canvas, ctx } = canvasFromImage(image);
  try {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    correctPixels(pixels.data, effectiveAnalysis(photo), photo.adjustments, pixels.data);
    ctx.putImageData(pixels, 0, 0);
    const format = photoOutputFormat(photo.file.type, choice);
    const blob = await encodeCanvas(canvas, format.mime, format.quality);
    return { blob, name: correctedFileName(photo.file.name, format.ext) };
  } finally {
    // Release the full-resolution backing store before the next photo in a batch.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** A drawn snapshot pushed through the same lifted-black, crushed-blue fade as an aged one-hour print. */
async function sampleFadedPrint(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 600;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  const sky = ctx.createLinearGradient(0, 0, 0, 380);
  sky.addColorStop(0, "#5b8bd4");
  sky.addColorStop(1, "#d3e3f3");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 900, 380);
  ctx.fillStyle = "#ffffff";
  for (const [x, y, rx] of [[150, 90, 70], [210, 80, 50], [640, 120, 80], [700, 105, 55]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#4c8a3b";
  ctx.fillRect(0, 380, 900, 220);
  ctx.fillStyle = "#9b9b97";
  ctx.beginPath();
  ctx.moveTo(530, 400);
  ctx.lineTo(600, 400);
  ctx.lineTo(760, 600);
  ctx.lineTo(420, 600);
  ctx.fill();
  ctx.fillStyle = "#ecebe6";
  ctx.fillRect(420, 220, 300, 180);
  ctx.fillStyle = "#6f3529";
  ctx.beginPath();
  ctx.moveTo(400, 225);
  ctx.lineTo(570, 120);
  ctx.lineTo(740, 225);
  ctx.fill();
  ctx.fillStyle = "#b8352b";
  ctx.fillRect(540, 300, 60, 100);
  ctx.fillStyle = "#2f3e4f";
  ctx.fillRect(450, 260, 60, 50);
  ctx.fillRect(630, 260, 60, 50);
  for (let index = 0; index < 60; index += 1) {
    ctx.fillStyle = index % 3 === 0 ? "#e9c13b" : index % 3 === 1 ? "#8b4fb3" : "#e46a8a";
    ctx.beginPath();
    ctx.arc(30 + ((index * 61) % 360), 430 + ((index * 37) % 150), 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = frame;
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 34 + data[index] * 0.84;
    data[index + 1] = 28 + data[index + 1] * 0.8;
    data[index + 2] = 8 + data[index + 2] * 0.32;
  }
  ctx.putImageData(frame, 0, 0);
  const blob = await encodeCanvas(canvas, "image/jpeg", 0.9);
  return new File([blob], "sample-faded-print.jpg", { type: "image/jpeg" });
}

function CorrectedThumb({ photo }: { photo: PhotoEntry }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = photo.thumb.width;
    canvas.height = photo.thumb.height;
    const output = new ImageData(photo.thumb.width, photo.thumb.height);
    correctPixels(photo.thumb.data, effectiveAnalysis(photo), photo.adjustments, output.data);
    canvas.getContext("2d")?.putImageData(output, 0, 0);
  }, [photo]);
  return <canvas ref={canvasRef} aria-hidden="true" />;
}

export function PhotoColorTool() {
  const inputId = useId();
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<ImageData | null>(null);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [frame, setFrame] = useState<{ id: string; pixels: ImageData } | null>(null);
  const [view, setView] = useState<PreviewView>("after");
  const [split, setSplit] = useState(50);
  const [picking, setPicking] = useState(false);
  const [output, setOutput] = useState<PhotoOutputChoice>("match");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = progress !== "";
  const selectedIndex = photos.findIndex((photo) => photo.id === selectedId);
  const selected = selectedIndex >= 0 ? photos[selectedIndex] : null;
  const selectedFile = selected?.file ?? null;
  const previewReady = Boolean(selected && frame && frame.id === selected.id);

  useEffect(() => {
    if (!selectedId || !selectedFile) {
      setFrame(null);
      return;
    }
    let cancelled = false;
    loadImage(selectedFile)
      .then((image) => {
        if (!cancelled) setFrame({ id: selectedId, pixels: drawScaled(image, PREVIEW_PIXELS, PREVIEW_SIDE) });
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageOf(caught, "Could not open that photo"));
      });
    return () => { cancelled = true; };
  }, [selectedId, selectedFile]);

  useEffect(() => {
    const before = beforeRef.current;
    const after = afterRef.current;
    if (!frame || !before || !after) return;
    for (const canvas of [before, after]) {
      canvas.width = frame.pixels.width;
      canvas.height = frame.pixels.height;
    }
    before.getContext("2d")?.putImageData(frame.pixels, 0, 0);
  }, [frame, previewReady]);

  useEffect(() => {
    const after = afterRef.current;
    if (!frame || !after || !selected || frame.id !== selected.id) return;
    const handle = requestAnimationFrame(() => {
      const { width, height } = frame.pixels;
      let scratch = scratchRef.current;
      if (!scratch || scratch.width !== width || scratch.height !== height) {
        scratch = new ImageData(width, height);
        scratchRef.current = scratch;
      }
      try {
        correctPixels(frame.pixels.data, effectiveAnalysis(selected), selected.adjustments, scratch.data);
        after.getContext("2d")?.putImageData(scratch, 0, 0);
      } catch (caught) {
        setError(messageOf(caught, "Could not correct this photo"));
      }
    });
    return () => cancelAnimationFrame(handle);
  }, [frame, selected]);

  useEffect(() => {
    if (!picking) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPicking(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  async function addFiles(list: FileList | readonly File[]) {
    const incoming = [...list];
    if (incoming.length === 0 || busy) return;
    setError("");
    setNotice("");
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`Up to ${MAX_PHOTOS} photos at a time. Download this batch, then clear it to start another.`);
      return;
    }
    const accepted = incoming.slice(0, room);
    const added: PhotoEntry[] = [];
    const skipped: string[] = [];
    try {
      for (const [index, file] of accepted.entries()) {
        setProgress(`Reading ${index + 1} of ${accepted.length}…`);
        try {
          assertImageFile(file, MAX_PHOTO_BYTES);
          const image = await loadImage(file);
          assertImageDimensions(image.naturalWidth, image.naturalHeight);
          added.push({
            id: uniqueId(),
            file,
            width: image.naturalWidth,
            height: image.naturalHeight,
            analysis: analyzeColorCast(drawScaled(image, ANALYSIS_PIXELS, ANALYSIS_SIDE).data),
            thumb: drawScaled(image, THUMB_PIXELS, THUMB_SIDE),
            adjustments: { ...DEFAULT_ADJUSTMENTS },
            neutral: null,
          });
        } catch (caught) {
          skipped.push(`${file.name} (${messageOf(caught, "could not be read")})`);
        }
      }
    } finally {
      setProgress("");
    }
    if (added.length > 0) {
      setPhotos((current) => [...current, ...added]);
      if (!selected) setSelectedId(added[0].id);
      setNotice(`Added ${added.length} photo${added.length === 1 ? "" : "s"}, each auto-corrected. Select one to fine-tune it.`);
    }
    const problems = [
      skipped.length > 0 ? `Skipped ${skipped.length}: ${skipped.join("; ")}.` : "",
      incoming.length > accepted.length ? `Only ${accepted.length} of ${incoming.length} were added; the limit is ${MAX_PHOTOS} photos per batch.` : "",
    ].filter(Boolean);
    if (problems.length > 0) setError(problems.join(" "));
  }

  function updateSelected(update: (photo: PhotoEntry) => PhotoEntry) {
    if (!selectedId) return;
    setPhotos((current) => current.map((photo) => (photo.id === selectedId ? update(photo) : photo)));
  }

  function setAdjustment(key: keyof ColorAdjustments, value: number) {
    updateSelected((photo) => ({ ...photo, adjustments: { ...photo.adjustments, [key]: value } }));
  }

  function select(id: string) {
    setSelectedId(id);
    setPicking(false);
  }

  function pickNeutral(event: MouseEvent<HTMLDivElement>) {
    if (!picking || !frame || !selected || frame.id !== selected.id) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const { width, height, data } = frame.pixels;
    try {
      const sample = averageSample(
        data,
        width,
        height,
        ((event.clientX - bounds.left) * width) / bounds.width,
        ((event.clientY - bounds.top) * height) / bounds.height,
        Math.max(2, Math.round(Math.max(width, height) / 400)),
      );
      updateSelected((photo) => ({ ...photo, neutral: sample }));
      setPicking(false);
      setError("");
    } catch (caught) {
      setError(messageOf(caught, "Could not read that spot"));
    }
  }

  function applyToAll() {
    if (!selected) return;
    const adjustments = selected.adjustments;
    setPhotos((current) => current.map((photo) => ({ ...photo, adjustments: { ...adjustments } })));
    setNotice(`Copied these slider settings to all ${photos.length} photos. Gray spots stay with the photo they were picked on.`);
  }

  function removeSelected() {
    if (!selected) return;
    const remaining = photos.filter((photo) => photo.id !== selected.id);
    setPhotos(remaining);
    setSelectedId(remaining[Math.min(selectedIndex, remaining.length - 1)]?.id ?? null);
    setPicking(false);
    setNotice("");
  }

  function clearAll() {
    setPhotos([]);
    setSelectedId(null);
    setPicking(false);
    setNotice("");
    setError("");
  }

  async function downloadSelected() {
    if (!selected) return;
    setError("");
    setNotice("");
    setProgress("Correcting at full resolution…");
    try {
      const result = await renderCorrected(selected, output);
      downloadBlob(result.blob, result.name);
      setNotice(`Saved ${result.name} · ${formatBytes(result.blob.size)}`);
    } catch (caught) {
      setError(messageOf(caught, "Could not save that photo"));
    } finally {
      setProgress("");
    }
  }

  async function downloadAll() {
    if (photos.length === 0) return;
    setError("");
    setNotice("");
    const batch = photos;
    try {
      const entries: { name: string; data: Uint8Array }[] = [];
      for (const [index, photo] of batch.entries()) {
        setProgress(`Correcting ${index + 1} of ${batch.length} at full resolution…`);
        const result = await renderCorrected(photo, output);
        entries.push({ name: result.name, data: new Uint8Array(await result.blob.arrayBuffer()) });
      }
      setProgress("Packing ZIP…");
      // fflate allocates its output on a plain ArrayBuffer.
      const zip = (await buildPhotoZip(entries)) as Uint8Array<ArrayBuffer>;
      downloadBlob(new Blob([zip], { type: "application/zip" }), "corrected-photos.zip");
      setNotice(`Downloaded ${entries.length} corrected photos · ${formatBytes(zip.byteLength)}`);
    } catch (caught) {
      setError(messageOf(caught, "Could not build the ZIP"));
    } finally {
      setProgress("");
    }
  }

  function loadSample() {
    setError("");
    void sampleFadedPrint().then((file) => addFiles([file])).catch((caught: unknown) => setError(messageOf(caught, "Could not load the sample")));
  }

  const aspect = frame ? frame.pixels.width / frame.pixels.height : 1;
  const afterClip = view === "after" ? "none" : view === "before" ? "inset(0 0 0 100%)" : `inset(0 0 0 ${split}%)`;

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Photo color fix</h1>
        <p className="lede">
          Remove yellow, faded, or off-color casts from scanned prints and negatives. Every photo is balanced automatically, then you can fine-tune it. Pixels never leave this browser.
        </p>
      </header>
      <div className="workspace photo-workspace">
        <section className="panel">
          <label
            className={`drop${photos.length > 0 ? " compact" : ""}`}
            htmlFor={inputId}
            onDragOver={(event) => {
              event.preventDefault();
              event.currentTarget.classList.add("over");
            }}
            onDragLeave={(event) => event.currentTarget.classList.remove("over")}
            onDrop={(event: DragEvent<HTMLLabelElement>) => {
              event.preventDefault();
              event.currentTarget.classList.remove("over");
              void addFiles(event.dataTransfer.files);
            }}
          >
            <input
              id={inputId}
              className="hidden-file"
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <div>
              <strong>{photos.length > 0 ? "Add more photos" : "Drop scanned photos"}</strong>
              Drop one or dozens. JPEG, PNG, WebP, BMP, or AVIF, up to 80 MB and 40 megapixels each.
            </div>
          </label>
          {progress && <p role="status" className="lede" style={{ margin: "16px 0 0" }}>{progress}</p>}
          {error && <p role="alert" className="lede" style={{ margin: "16px 0 0" }}>{error}</p>}
          {notice && !progress && <p role="status" className="lede" style={{ margin: "16px 0 0" }}>{notice}</p>}

          {selected && (
            <>
              <div className="row" style={{ justifyContent: "space-between", margin: "16px 0 10px" }}>
                <div className="segmented" role="group" aria-label="Preview">
                  {VIEWS.map((option) => (
                    <button key={option.id} type="button" className={view === option.id ? "on" : ""} aria-pressed={view === option.id} onClick={() => setView(option.id)}>
                      {option.label}
                    </button>
                  ))}
                </div>
                <span className="hint" style={{ margin: 0 }}>{selected.file.name} · {selected.width}×{selected.height}</span>
              </div>
              {previewReady ? (
                <>
                  <div
                    className={`photo-stage${picking ? " picking" : ""}`}
                    style={{ aspectRatio: `${frame?.pixels.width} / ${frame?.pixels.height}`, width: `min(100%, calc(68vh * ${aspect}))` }}
                    onClick={pickNeutral}
                  >
                    <canvas ref={beforeRef} role="img" aria-label={`Original ${selected.file.name}`} />
                    <canvas ref={afterRef} role="img" aria-label={`Corrected ${selected.file.name}`} style={{ clipPath: afterClip }} />
                    {view === "split" && (
                      <>
                        <div className="photo-divider" style={{ left: `${split}%` }} />
                        <span className="photo-tag" style={{ left: 8 }}>Original</span>
                        <span className="photo-tag" style={{ right: 8 }}>Corrected</span>
                      </>
                    )}
                    {view === "before" && <span className="photo-tag" style={{ left: 8 }}>Original</span>}
                  </div>
                  {view === "split" && (
                    <input
                      className="range"
                      type="range"
                      min={0}
                      max={100}
                      value={split}
                      aria-label="Move the divider between original and corrected"
                      style={{ marginTop: 10 }}
                      onChange={(event) => setSplit(Number(event.target.value))}
                    />
                  )}
                </>
              ) : (
                <p className="lede">Opening preview…</p>
              )}
            </>
          )}

          {photos.length > 1 && (
            <div className="photo-strip" aria-label="Photos in this batch">
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  className="photo-thumb"
                  aria-pressed={photo.id === selectedId}
                  aria-label={`Photo ${index + 1}: ${photo.file.name}`}
                  onClick={() => select(photo.id)}
                >
                  <CorrectedThumb photo={photo} />
                  <span>{photo.file.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          {selected ? (
            <fieldset className="stack" disabled={busy}>
              <div>
                <h2>Adjust</h2>
                <p className="hint" style={{ marginTop: 0 }}>
                  {photos.length > 1 ? `Photo ${selectedIndex + 1} of ${photos.length}. Settings apply to this photo only.` : "Settings apply to this photo."}
                </p>
              </div>
              <div>
                <label className="field">
                  <span>Auto correction · {selected.adjustments.strength}%</span>
                  <input className="range" type="range" min={0} max={100} value={selected.adjustments.strength} onChange={(event) => setAdjustment("strength", Number(event.target.value))} />
                </label>
                <p className="hint">Stretches each color channel to full range and balances the midtones. Lower it if a photo should keep some warmth, like a sunset.</p>
              </div>
              <div>
                <span className="field-label">Gray spot</span>
                <div className="row">
                  <button className="btn ghost" type="button" aria-pressed={picking} onClick={() => setPicking((current) => !current)}>
                    {picking ? "Cancel picking" : selected.neutral ? "Pick again" : "Pick a gray spot"}
                  </button>
                  {selected.neutral && (
                    <>
                      <span className="photo-swatch" style={{ background: `rgb(${selected.neutral.r}, ${selected.neutral.g}, ${selected.neutral.b})` }} title="Original color of the picked spot" />
                      <button className="btn ghost" type="button" onClick={() => updateSelected((photo) => ({ ...photo, neutral: null }))}>Clear</button>
                    </>
                  )}
                </div>
                <p className="hint">
                  {picking
                    ? "Click something in the photo that should be white or gray: a shirt, a wall, pavement, a cloud. Esc cancels."
                    : selected.neutral
                      ? "Midtones are balanced from your spot instead of the whole photo."
                      : "Optional. Use it when auto gets close but whites or skin still look off."}
                </p>
              </div>
              {SLIDERS.map((slider) => (
                <label className="field" key={slider.key}>
                  <span>{slider.label} · {signed(selected.adjustments[slider.key])}</span>
                  <input
                    className="range"
                    type="range"
                    min={-100}
                    max={100}
                    value={selected.adjustments[slider.key]}
                    onChange={(event) => setAdjustment(slider.key, Number(event.target.value))}
                  />
                  <span className="range-ends" aria-hidden="true"><span>{slider.left}</span><span>{slider.right}</span></span>
                </label>
              ))}
              <div className="row">
                <button className="btn ghost" type="button" onClick={() => updateSelected((photo) => ({ ...photo, adjustments: { ...DEFAULT_ADJUSTMENTS }, neutral: null }))}>
                  Reset photo
                </button>
                {photos.length > 1 && (
                  <button className="btn ghost" type="button" onClick={applyToAll}>Use these sliders on all {photos.length}</button>
                )}
              </div>
              <label className="field">
                <span>Save as</span>
                <select value={output} onChange={(event) => setOutput(event.target.value as PhotoOutputChoice)}>
                  <option value="match">Same as original</option>
                  <option value="jpeg">JPEG · 92% quality</option>
                  <option value="png">PNG · lossless, larger</option>
                  <option value="webp">WebP · 92% quality</option>
                </select>
              </label>
              <div className="row">
                <button className="btn" type="button" onClick={() => void downloadSelected()}>{busy ? "Working…" : "Download photo"}</button>
                {photos.length > 1 && (
                  <button className="btn ghost" type="button" onClick={() => void downloadAll()}>Download all {photos.length} as ZIP</button>
                )}
              </div>
              <p className="hint" style={{ marginTop: 0 }}>Saved at full resolution. Re-encoding drops camera and scanner metadata.</p>
              <div className="row">
                <button className="btn ghost" type="button" onClick={removeSelected}>Remove photo</button>
                {photos.length > 1 && <button className="btn ghost" type="button" onClick={clearAll}>Clear all</button>}
              </div>
            </fieldset>
          ) : (
            <div className="stack">
              <h2>How it works</h2>
              <p className="lede" style={{ margin: 0 }}>
                Aged drugstore prints and negatives usually lose their blue channel first, which reads as a heavy yellow cast. Each photo's red, green, and blue channels are stretched back to full range and their midtones balanced, the same idea as a darkroom auto-color pass.
              </p>
              <p className="lede" style={{ margin: 0 }}>
                Drop a whole folder of scans, check each one in the strip, nudge the ones that need it, then download them all as a ZIP.
              </p>
              <button className="btn ghost" type="button" disabled={busy} onClick={loadSample}>Try a sample faded print</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
