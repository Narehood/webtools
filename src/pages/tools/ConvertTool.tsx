import { useState } from "react";
import { DropZone } from "../../components/DropZone";
import { canvasFromImage, downloadBlob, encodeCanvas, formatBytes, loadImage, sampleProductPng } from "../../lib/image";

const formats = [
  { mime: "image/png", ext: "png", label: "PNG" },
  { mime: "image/jpeg", ext: "jpg", label: "JPEG" },
  { mime: "image/webp", ext: "webp", label: "WebP" },
  { mime: "image/avif", ext: "avif", label: "AVIF" },
];

type SharedProps = {
  title: string;
  lede: string;
  action: string;
  defaultMime: string;
};

function ImageEncodeTool({ title, lede, action, defaultMime }: SharedProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [mime, setMime] = useState(defaultMime);
  const [quality, setQuality] = useState(0.82);
  const [output, setOutput] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const format = formats.find((item) => item.mime === mime) ?? formats[0];

  async function convert() {
    if (!file) return;
    setBusy(true);
    try {
      const image = await loadImage(file);
      const { canvas } = canvasFromImage(image);
      const blob = await encodeCanvas(canvas, mime, quality);
      setOutput(blob);
    } catch (error) {
      setOutput(null);
      alert(error instanceof Error ? error.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <DropZone
            label="Drop a source image"
            hint="Encoded with the canvas API in this browser."
            onFile={(next) => {
              setFile(next);
              setPreview(URL.createObjectURL(next));
              setOutput(null);
            }}
          />
          <div className="stack" style={{ marginTop: 16 }}>
            <label className="field">
              <span>Target format</span>
              <select value={mime} onChange={(event) => setMime(event.target.value)}>
                {formats.map((item) => (
                  <option key={item.mime} value={item.mime}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Quality · {Math.round(quality * 100)}%</span>
              <input
                className="range"
                type="range"
                min={0.3}
                max={1}
                step={0.01}
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
              />
            </label>
            <div className="row">
              <button className="btn" disabled={!file || busy} onClick={() => void convert()}>
                {busy ? "Encoding…" : action}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() =>
                  void sampleProductPng().then((next) => {
                    setFile(next);
                    setPreview(URL.createObjectURL(next));
                    setOutput(null);
                  })
                }
              >
                Use sample
              </button>
              {output && (
                <button className="btn ghost" onClick={() => downloadBlob(output, `output.${format.ext}`)}>
                  Download
                </button>
              )}
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="stat-grid">
            <div className="stat">
              <span>Source</span>
              <b>{file ? formatBytes(file.size) : "—"}</b>
            </div>
            <div className="stat">
              <span>Output</span>
              <b>{output ? formatBytes(output.size) : "—"}</b>
            </div>
          </div>
          <div className="preview-frame" style={{ marginTop: 16 }}>
            {preview && <img src={preview} alt="Source" />}
          </div>
        </section>
      </div>
    </>
  );
}

export function ConvertTool() {
  return (
    <ImageEncodeTool
      title="Image convert"
      lede="Re-encode a raster image in this browser. The original stays on disk until you download the new one."
      action="Convert"
      defaultMime="image/webp"
    />
  );
}

export function CompressTool() {
  return (
    <ImageEncodeTool
      title="Image compress"
      lede="Dial quality down and compare file size before you keep the result. Encoding never leaves this device."
      action="Compress"
      defaultMime="image/jpeg"
    />
  );
}
