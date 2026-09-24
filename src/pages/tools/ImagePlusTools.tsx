import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DropZone } from "../../components/DropZone";
import { CropStage } from "../../components/CropStage";
import { CopyButton } from "../../components/CopyButton";
import { useObjectUrl } from "../../hooks/useObjectUrl";
import { editCrop, fullCrop, type CropBox } from "../../lib/cropGeometry";
import {
  canvasFromImage,
  downloadBlob,
  encodeCanvas,
  formatBytes,
  loadImage,
  sampleProductPng,
} from "../../lib/image";
import { formatMeta, gpsOf, isDisplayable, pick, readExif } from "../../lib/exif";

export function ResizeTool() {
  const [file, setFile] = useState<File | null>(null);
  const preview = useObjectUrl(file);
  const [source, setSource] = useState<{ w: number; h: number } | null>(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const [lock, setLock] = useState(true);
  const [ratio, setRatio] = useState(1);
  const [crop, setCrop] = useState<CropBox>({ x: 0, y: 0, w: 800, h: 600 });
  const [cropLock, setCropLock] = useState(false);
  const [cropAspect, setCropAspect] = useState(1);
  const [output, setOutput] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const outputPreview = useObjectUrl(output);
  const cropRatio = cropLock ? cropAspect : null;
  useEffect(() => { setOutput(null); }, [width, height, crop]);

  async function takeFile(next: File) {
    setBusy(true);
    setError("");
    try {
      const image = await loadImage(next);
      const w = image.naturalWidth;
      const h = image.naturalHeight;
      setFile(next);
      setSource({ w, h });
      setWidth(w);
      setHeight(h);
      setRatio(w / h);
      setCrop(fullCrop(w, h));
      setCropLock(false);
      setCropAspect(w / h);
      setOutput(null);
    } finally {
      setBusy(false);
    }
  }

  function changeCrop(patch: Partial<CropBox>) {
    if (!source) return;
    setCrop((current) => editCrop(current, patch, source.w, source.h, cropRatio));
  }

  function selectFullFrame() {
    if (!source) return;
    setCrop(fullCrop(source.w, source.h));
    if (cropLock) setCropAspect(source.w / source.h);
  }

  async function run() {
    if (!file || !source) return;
    setBusy(true);
    setError("");
    setOutput(null);
    try {
      if (![width, height, crop.w, crop.h].every((value) => Number.isSafeInteger(value) && value > 0)
        || ![crop.x, crop.y].every((value) => Number.isSafeInteger(value) && value >= 0)) {
        throw new Error("Use positive whole-number sizes and non-negative crop coordinates");
      }
      const image = await loadImage(file);
      if (crop.x + crop.w > image.naturalWidth || crop.y + crop.h > image.naturalHeight) throw new Error("Crop must fit inside the source image");
      const drawn = canvasFromImage(image).canvas;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available");
      ctx.drawImage(drawn, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
      setOutput(await encodeCanvas(canvas, "image/png", 0.92));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resize image");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Resize & crop</h1>
        <p className="lede">Drag the box to frame the photo. Keep its ratio, or resize it freely, then set the output size.</p>
      </header>
      <div className="workspace crop-workspace">
        <section className="panel">
          <DropZone disabled={busy} label="Drop an image" hint="PNG, JPEG, or WebP." onFile={takeFile} />
          <p className="lede" style={{ margin: "16px 0 0" }}>
            {file && source ? `${file.name} · ${formatBytes(file.size)} · ${source.w}×${source.h}` : "Waiting for a file."}
          </p>
          {preview && source && (
            <CropStage
              src={preview}
              imageWidth={source.w}
              imageHeight={source.h}
              crop={crop}
              aspect={cropRatio}
              onChange={setCrop}
            />
          )}
          {outputPreview && (
            <>
              <p className="lede" style={{ margin: "16px 0 8px" }}>Encoded result</p>
              <div className="preview-frame"><img src={outputPreview} alt="Resized result" /></div>
            </>
          )}
        </section>
        <section className="panel">
          <fieldset disabled={busy} className="stack">
            <div>
              <span className="field-label">Crop shape</span>
              <div className="segmented" role="group" aria-label="Crop shape">
                <button type="button" className={cropLock ? "" : "on"} onClick={() => setCropLock(false)}>Free</button>
                <button
                  type="button"
                  className={cropLock ? "on" : ""}
                  onClick={() => {
                    if (!cropLock) setCropAspect(crop.w / Math.max(1, crop.h));
                    setCropLock(true);
                  }}
                >
                  Lock ratio
                </button>
              </div>
              <p className="hint">
                {cropLock
                  ? `Handles keep ${cropAspect.toFixed(2)}:1. Drag inside the box to move it.`
                  : "Drag a handle to any shape, or drag inside the box to move it."}
              </p>
            </div>
            <div className="stat-grid">
              <label className="field">
                <span>Crop X</span>
                <input type="number" min={0} value={crop.x} onChange={(event) => changeCrop({ x: Number(event.target.value) })} />
              </label>
              <label className="field">
                <span>Crop Y</span>
                <input type="number" min={0} value={crop.y} onChange={(event) => changeCrop({ y: Number(event.target.value) })} />
              </label>
              <label className="field">
                <span>Crop W</span>
                <input type="number" min={1} value={crop.w} onChange={(event) => changeCrop({ w: Number(event.target.value) })} />
              </label>
              <label className="field">
                <span>Crop H</span>
                <input type="number" min={1} value={crop.h} onChange={(event) => changeCrop({ h: Number(event.target.value) })} />
              </label>
            </div>
            <button className="btn ghost" type="button" disabled={!source} onClick={selectFullFrame}>
              Full frame
            </button>
            <div className="stat-grid">
              <label className="field">
                <span>Output width</span>
                <input
                  type="number"
                  min={1}
                  value={width}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setWidth(next);
                    if (lock) setHeight(Math.max(1, Math.round(next / ratio)));
                  }}
                />
              </label>
              <label className="field">
                <span>Output height</span>
                <input
                  type="number"
                  min={1}
                  value={height}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setHeight(next);
                    if (lock) setWidth(Math.max(1, Math.round(next * ratio)));
                  }}
                />
              </label>
            </div>
            <label className="row">
              <input type="checkbox" checked={lock} onChange={(event) => setLock(event.target.checked)} />
              Lock output aspect
            </label>
            <div className="row">
              <button className="btn" type="button" disabled={!file || busy} onClick={() => void run()}>
                {busy ? "Encoding…" : "Resize"}
              </button>
              <button className="btn ghost" type="button" onClick={() => void sampleProductPng().then(takeFile).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load sample"))}>
                Use sample
              </button>
              {output && (
                <button className="btn ghost" type="button" onClick={() => downloadBlob(output, "resized.png")}>
                  Download
                </button>
              )}
            </div>
          </fieldset>
          {error && <p role="alert" className="lede">{error}</p>}
        </section>
      </div>
    </>
  );
}

export function ExifTool() {
  const [file, setFile] = useState<File | null>(null);
  const preview = useObjectUrl(file);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [clean, setClean] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function takeFile(next: File) {
    setBusy(true);
    setError("");
    setFile(next);
    setClean(null);
    setMeta(null);
    try {
      setMeta(await readExif(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read metadata");
    } finally { setBusy(false); }
  }

  async function strip() {
    if (!file) return;
    setBusy(true);
    setError("");
    setClean(null);
    try {
      const image = await loadImage(file);
      const { canvas } = canvasFromImage(image);
      const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
      setClean(await encodeCanvas(canvas, mime, 0.92));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not strip metadata");
    } finally {
      setBusy(false);
    }
  }

  const entries = Object.entries(meta ?? {}).filter(isDisplayable).slice(0, 18);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>EXIF stripper</h1>
        <p className="lede">
          Camera, timestamp, and GPS stay in this tab. Re-encoding drops the tags before you download.
        </p>
      </header>
      <div className="workspace">
        <section className="panel">
          <DropZone disabled={busy} label="Drop a photo" hint="JPEG is richest in EXIF. PNG often has none." onFile={takeFile} />
          {error && <p role="alert" className="lede">{error}</p>}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={!file || busy} onClick={() => void strip()}>
              {busy ? "Stripping…" : "Strip metadata"}
            </button>
            {clean && (
              <button className="btn ghost" onClick={() => downloadBlob(clean, `clean.${file?.type === "image/png" ? "png" : "jpg"}`)}>
                Download clean
              </button>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="preview-frame" style={{ marginBottom: 16 }}>
            {preview && <img src={preview} alt="Photo" />}
          </div>
          {meta && entries.length === 0 && <p className="lede">No EXIF tags on this file.</p>}
          {entries.length > 0 && (
            <div className="stack">
              {entries.map(([key, value]) => (
                <div className="stat" key={key}>
                  <span>{key}</span>
                  <b className="wrap">{formatMeta(value)}</b>
                </div>
              ))}
              <Link to="/exif-view" className="back">
                Open in EXIF viewer →
              </Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export function ExifViewerTool() {
  const [file, setFile] = useState<File | null>(null);
  const preview = useObjectUrl(file);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function takeFile(next: File) {
    setBusy(true);
    setError("");
    setFile(next);
    setMeta(null);
    try {
      const image = await loadImage(next);
      setSize({ w: image.naturalWidth, h: image.naturalHeight });
      setMeta(await readExif(next));
    } catch (err) {
      setSize({ w: 0, h: 0 });
      setError(err instanceof Error ? err.message : "Could not read image metadata");
    } finally { setBusy(false); }
  }

  const entries = Object.entries(meta ?? {}).filter(isDisplayable);
  const gps = meta ? gpsOf(meta) : null;
  const json = meta && entries.length
    ? JSON.stringify(Object.fromEntries(entries.map(([key, value]) => [key, formatMeta(value)])), null, 2)
    : "";
  const summary = meta
    ? [
        ["Camera", [pick(meta, ["Make"]), pick(meta, ["Model"])].filter(Boolean).join(" ")],
        ["Lens", pick(meta, ["LensModel", "Lens", "LensMake"])],
        ["Taken", pick(meta, ["DateTimeOriginal", "CreateDate", "DateTime", "ModifyDate"])],
        ["Exposure", [pick(meta, ["ExposureTime"]), pick(meta, ["FNumber"]), pick(meta, ["ISO", "ISOSpeedRatings"])].filter(Boolean).join(" · ")],
        ["Focal length", pick(meta, ["FocalLength", "FocalLengthIn35mmFormat"])],
        ["Software", pick(meta, ["Software"])],
      ].filter(([, value]) => value)
    : [];

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>EXIF viewer</h1>
        <p className="lede">
          Camera body, lens, GPS, and capture settings — parsed in this tab. Nothing is uploaded.
        </p>
      </header>
      <div className="workspace">
        <section className="panel">
          <DropZone
            disabled={busy}
            label="Drop a photo"
            hint="JPEG and some RAW wrappers carry EXIF. PNG and WebP often do not."
            onFile={takeFile}
          />
          <p className="lede" style={{ margin: "16px 0 0" }}>
            {file
              ? `${file.name} · ${formatBytes(file.size)}${size.w ? ` · ${size.w}×${size.h}` : ""}`
              : "Waiting for a file."}
          </p>
          <div className="preview-frame">{preview && <img src={preview} alt="Photo" />}</div>
          <div className="row" style={{ marginTop: 16 }}>
            <button disabled={busy} className="btn ghost" type="button" onClick={() => void sampleProductPng().then(takeFile).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load sample"))}>
              Use sample
            </button>
            <CopyButton text={json} />
            <Link to="/exif" className="btn ghost">
              Strip instead
            </Link>
          </div>
        </section>
        <section className="panel">
          {error && <p role="alert" className="lede">{error}</p>}
          {!meta && !error && <p className="lede">{busy ? "Reading metadata…" : "Metadata appears here."}</p>}
          {meta && entries.length === 0 && (
            <p className="lede">No EXIF tags on this file. Try a JPEG from a camera or phone.</p>
          )}
          {summary.length > 0 && (
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              {summary.map(([label, value]) => (
                <div className="stat" key={label}>
                  <span>{label}</span>
                  <b className="wrap">{value}</b>
                </div>
              ))}
              {gps && (
                <div className="stat">
                  <span>GPS</span>
                  <b className="wrap">
                    {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                  </b>
                  <a
                    className="back"
                    href={`https://www.openstreetmap.org/?mlat=${gps.lat}&mlon=${gps.lng}#map=16/${gps.lat}/${gps.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open map
                  </a>
                </div>
              )}
            </div>
          )}
          {entries.length > 0 && (
            <table className="meta-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(([key, value]) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{formatMeta(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
