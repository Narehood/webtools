import { useState } from "react";
import { DropZone } from "../../components/DropZone";
import { useObjectUrl } from "../../hooks/useObjectUrl";
import { downloadBlob, formatBytes, loadImage, removeFlatBackground, sampleProductPng } from "../../lib/image";

export function BackgroundTool() {
  const [file, setFile] = useState<File | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const preview = useObjectUrl(file);
  const result = useObjectUrl(blob);
  const [tolerance, setTolerance] = useState(28);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(next: File) {
    setFile(next);
    setBlob(null);
    setError("");
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError("");
    setBlob(null);
    try {
      const image = await loadImage(file);
      const canvas = removeFlatBackground(image, tolerance);
      const nextBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Encode failed"))), "image/png"),
      );
      setBlob(nextBlob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove background");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Background remover</h1>
        <p className="lede">
          Samples the corners of the photo and lifts a flat studio color. Best on product shots
          with a solid backdrop. Processing stays in this tab.
        </p>
      </header>
      <div className="workspace">
        <section className="panel">
          <DropZone disabled={busy} label="Drop an image" hint="PNG, JPEG, or WebP. Nothing is uploaded." onFile={handleFile} />
          <div className="stack" style={{ marginTop: 16 }}>
            <label className="field">
              <span>Tolerance · {tolerance}</span>
              <input
                className="range"
                type="range"
                disabled={busy}
                min={8}
                max={80}
                value={tolerance}
                onChange={(event) => { setTolerance(Number(event.target.value)); setBlob(null); }}
              />
            </label>
            <div className="row">
              <button className="btn" disabled={!file || busy} onClick={() => void run()}>
                {busy ? "Lifting backdrop…" : "Remove background"}
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={busy}
                onClick={() => void sampleProductPng().then(handleFile).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load sample"))}
              >
                Use sample
              </button>
              {blob && (
                <button className="btn ghost" onClick={() => downloadBlob(blob, "background-removed.png")}>
                  Download PNG
                </button>
              )}
            </div>
          </div>
          {error && <p role="alert" className="lede">{error}</p>}
        </section>
        <section className="panel">
          <h3>Preview</h3>
          <p className="lede">{file ? `${file.name} · ${formatBytes(file.size)}` : "Waiting for a file."}</p>
          <div className="preview-frame">{(result || preview) && <img src={result || preview} alt="Working image" />}</div>
        </section>
      </div>
    </>
  );
}
