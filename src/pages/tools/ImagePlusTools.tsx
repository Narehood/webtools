import { useState } from "react";
import { Link } from "react-router-dom";
import { DropZone } from "../../components/DropZone";
import { CopyButton } from "../../components/CopyButton";
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
  const [preview, setPreview] = useState("");
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const [lock, setLock] = useState(true);
  const [ratio, setRatio] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(800);
  const [cropH, setCropH] = useState(600);
  const [output, setOutput] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  async function takeFile(next: File) {
    const image = await loadImage(next);
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setWidth(w);
    setHeight(h);
    setRatio(w / h);
    setCropX(0);
    setCropY(0);
    setCropW(w);
    setCropH(h);
    setOutput(null);
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    try {
      const image = await loadImage(file);
      const source = canvasFromImage(image).canvas;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available");
      ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
      setOutput(await encodeCanvas(canvas, "image/png", 0.92));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Resize & crop</h1>
        <p className="lede">Pick a crop rectangle, set an output size, and encode in this browser.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <DropZone label="Drop an image" hint="PNG, JPEG, or WebP." onFile={(next) => void takeFile(next)} />
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="stat-grid">
              <label className="field">
                <span>Width</span>
                <input
                  type="number"
                  value={width}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setWidth(next);
                    if (lock) setHeight(Math.max(1, Math.round(next / ratio)));
                  }}
                />
              </label>
              <label className="field">
                <span>Height</span>
                <input
                  type="number"
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
              Lock aspect
            </label>
            <div className="stat-grid">
              <label className="field">
                <span>Crop X</span>
                <input type="number" value={cropX} onChange={(event) => setCropX(Number(event.target.value))} />
              </label>
              <label className="field">
                <span>Crop Y</span>
                <input type="number" value={cropY} onChange={(event) => setCropY(Number(event.target.value))} />
              </label>
              <label className="field">
                <span>Crop W</span>
                <input type="number" value={cropW} onChange={(event) => setCropW(Number(event.target.value))} />
              </label>
              <label className="field">
                <span>Crop H</span>
                <input type="number" value={cropH} onChange={(event) => setCropH(Number(event.target.value))} />
              </label>
            </div>
            <div className="row">
              <button className="btn" disabled={!file || busy} onClick={() => void run()}>
                {busy ? "Encoding…" : "Resize"}
              </button>
              <button className="btn ghost" type="button" onClick={() => void sampleProductPng().then(takeFile)}>
                Use sample
              </button>
              {output && (
                <button className="btn ghost" onClick={() => downloadBlob(output, "resized.png")}>
                  Download
                </button>
              )}
            </div>
          </div>
        </section>
        <section className="panel">
          <p className="lede">{file ? `${file.name} · ${formatBytes(file.size)}` : "Waiting for a file."}</p>
          <div className="preview-frame">{preview && <img src={preview} alt="Source" />}</div>
        </section>
      </div>
    </>
  );
}

export function ExifTool() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [clean, setClean] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  async function takeFile(next: File) {
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setClean(null);
    try {
      setMeta(await readExif(next));
    } catch {
      setMeta({});
    }
  }

  async function strip() {
    if (!file) return;
    setBusy(true);
    try {
      const image = await loadImage(file);
      const { canvas } = canvasFromImage(image);
      const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
      setClean(await encodeCanvas(canvas, mime, 0.92));
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
          <DropZone label="Drop a photo" hint="JPEG is richest in EXIF. PNG often has none." onFile={(next) => void takeFile(next)} />
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
  const [preview, setPreview] = useState("");
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  async function takeFile(next: File) {
    setFile(next);
    setPreview(URL.createObjectURL(next));
    try {
      const image = await loadImage(next);
      setSize({ w: image.naturalWidth, h: image.naturalHeight });
      setMeta(await readExif(next));
    } catch {
      setSize({ w: 0, h: 0 });
      setMeta({});
    }
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
            label="Drop a photo"
            hint="JPEG and some RAW wrappers carry EXIF. PNG and WebP often do not."
            onFile={(next) => void takeFile(next)}
          />
          <p className="lede" style={{ margin: "16px 0 0" }}>
            {file
              ? `${file.name} · ${formatBytes(file.size)}${size.w ? ` · ${size.w}×${size.h}` : ""}`
              : "Waiting for a file."}
          </p>
          <div className="preview-frame">{preview && <img src={preview} alt="Photo" />}</div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn ghost" type="button" onClick={() => void sampleProductPng().then(takeFile)}>
              Use sample
            </button>
            <CopyButton text={json} />
            <Link to="/exif" className="btn ghost">
              Strip instead
            </Link>
          </div>
        </section>
        <section className="panel">
          {!meta && <p className="lede">Metadata lands here.</p>}
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
