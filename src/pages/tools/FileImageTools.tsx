import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { CopyButton } from "../../components/CopyButton";
import { DropZone } from "../../components/DropZone";
import { useObjectUrl } from "../../hooks/useObjectUrl";
import { formatHsl, formatRgb } from "../../lib/colorValue";
import {
  assertImageDimensions,
  assertImageFile,
  fileStem,
  fitImageDimensions,
  safeHttpHref,
} from "../../lib/fileImageTools";
import {
  FAVICON_PNG_SPECS,
  buildFaviconZip,
  faviconHtmlSnippet,
  type FaviconPng,
} from "../../lib/favicon";
import { downloadBlob, encodeCanvas, formatBytes, loadImage } from "../../lib/image";
import { contrastTextColor, extractPalette, hexToRgb, rgbToHex, type PaletteColor } from "../../lib/imagePalette";
import { drawPickerPreview, readOriginalImagePixel } from "../../lib/imagePicker";
import {
  MAX_PDF_FILE_BYTES,
  MAX_PDF_PAGES,
  MAX_PDF_TOTAL_BYTES,
  buildPdf,
  inspectPdf,
  moveItem,
  movePdfSource,
  normalizeQuarterTurn,
  type PdfPagePlan,
  type PdfSourceData,
} from "../../lib/pdfTools";

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function uniqueId() {
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(36)).join("-");
}

function bytesBlob(bytes: Uint8Array, type: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

async function canvasPng(canvas: HTMLCanvasElement) {
  const blob = await encodeCanvas(canvas, "image/png", 1);
  return { blob, data: new Uint8Array(await blob.arrayBuffer()) };
}

export function QrReaderTool() {
  const requestRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ text: string; version: number; bytes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = useObjectUrl(file);

  const takeFile = useCallback(async (next: File) => {
    const request = ++requestRef.current;
    setBusy(true);
    setError("");
    setResult(null);
    setFile(null);
    try {
      assertImageFile(next);
      const image = await loadImage(next);
      if (request !== requestRef.current) return;
      assertImageDimensions(image.naturalWidth, image.naturalHeight);
      setFile(next);
      const fitted = fitImageDimensions(image.naturalWidth, image.naturalHeight, 8_000_000, 4096);
      const canvas = document.createElement("canvas");
      canvas.width = fitted.width;
      canvas.height = fitted.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas is not available");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const { default: jsQR } = await import("jsqr");
      if (request !== requestRef.current) return;
      const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
      if (!code) throw new Error("No QR code was found. Try a sharper image with the whole code visible");
      setResult({ text: code.data, version: code.version, bytes: code.binaryData.length });
    } catch (caught) {
      if (request === requestRef.current) setError(messageOf(caught, "Could not read that QR image"));
    } finally {
      if (request === requestRef.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const item = [...(event.clipboardData?.items ?? [])].find((candidate) => candidate.kind === "file" && candidate.type.startsWith("image/"));
      const pasted = item?.getAsFile();
      if (!pasted) return;
      event.preventDefault();
      void takeFile(new File([pasted], pasted.name || "pasted-qr.png", { type: pasted.type }));
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [takeFile]);

  const href = result ? safeHttpHref(result.text) : null;
  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>QR reader</h1>
        <p className="lede">Decode a QR code from an uploaded or pasted image. Pixels stay in this browser.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <DropZone
            disabled={busy}
            label="Drop a QR image"
            hint="PNG, JPEG, WebP, GIF, BMP, or AVIF. You can also paste an image anywhere on this page."
            onFile={takeFile}
          />
          {error && <p role="alert" className="lede" style={{ marginTop: 16 }}>{error}</p>}
          <p className="lede" style={{ marginTop: 16 }} aria-live="polite">
            {busy ? "Scanning image…" : file ? `${file.name} · ${formatBytes(file.size)}` : "Waiting for an image."}
          </p>
        </section>
        <section className="panel">
          <div className="preview-frame">{preview && <img src={preview} alt="QR source" />}</div>
          {result && (
            <div className="stack" style={{ marginTop: 16 }}>
              <label className="field">
                <span>Decoded content</span>
                <textarea readOnly value={result.text} spellCheck={false} />
              </label>
              <div className="row">
                <CopyButton text={result.text} />
                {href && <a className="btn ghost" href={href} target="_blank" rel="noreferrer">Open link</a>}
              </div>
              <p className="lede">QR version {result.version} · {result.bytes} decoded bytes</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function orderedSources(sources: readonly PdfSourceData[], order: readonly string[]) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return order.map((id) => byId.get(id)).filter((source): source is PdfSourceData => Boolean(source));
}

export function PdfTool() {
  const inputId = useId();
  const [sources, setSources] = useState<PdfSourceData[]>([]);
  const [sourceOrder, setSourceOrder] = useState<string[]>([]);
  const [pages, setPages] = useState<PdfPagePlan[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sourcesInOrder = useMemo(() => orderedSources(sources, sourceOrder), [sources, sourceOrder]);
  const selectedCount = pages.filter((page) => page.selected).length;
  const totalBytes = sources.reduce((sum, source) => sum + source.bytes.byteLength, 0);

  async function addFiles(fileList: FileList | readonly File[]) {
    const incoming = [...fileList];
    if (incoming.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const addedSources: PdfSourceData[] = [];
      const addedPages: PdfPagePlan[] = [];
      let nextBytes = totalBytes;
      let nextPages = pages.length;
      for (const file of incoming) {
        if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) throw new Error(`${file.name} is not a PDF`);
        if (file.size <= 0) throw new Error(`${file.name} is empty`);
        if (file.size > MAX_PDF_FILE_BYTES) throw new Error(`${file.name} exceeds the ${MAX_PDF_FILE_BYTES / 1024 / 1024} MB per-file limit`);
        nextBytes += file.size;
        if (nextBytes > MAX_PDF_TOTAL_BYTES) throw new Error(`PDFs may total at most ${MAX_PDF_TOTAL_BYTES / 1024 / 1024} MB`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const inspection = await inspectPdf(bytes);
        nextPages += inspection.pageCount;
        if (nextPages > MAX_PDF_PAGES) throw new Error(`Add at most ${MAX_PDF_PAGES} pages at a time`);
        const id = uniqueId();
        addedSources.push({ id, name: file.name, bytes, pageCount: inspection.pageCount });
        for (let sourcePageIndex = 0; sourcePageIndex < inspection.pageCount; sourcePageIndex += 1) {
          addedPages.push({ id: uniqueId(), sourceId: id, sourcePageIndex, selected: true, rotation: 0 });
        }
      }
      setSources((current) => [...current, ...addedSources]);
      setSourceOrder((current) => [...current, ...addedSources.map((source) => source.id)]);
      setPages((current) => [...current, ...addedPages]);
      setNotice(`Added ${addedSources.length} PDF${addedSources.length === 1 ? "" : "s"} with ${addedPages.length} page${addedPages.length === 1 ? "" : "s"}.`);
    } catch (caught) {
      setError(messageOf(caught, "Could not add those PDFs"));
    } finally {
      setBusy(false);
    }
  }

  function reorderSource(id: string, offset: -1 | 1) {
    const moved = movePdfSource(pages, sourceOrder, id, offset);
    setSourceOrder(moved.sourceOrder);
    setPages(moved.pages);
    setNotice("");
  }

  function removeSource(id: string) {
    setSources((current) => current.filter((source) => source.id !== id));
    setSourceOrder((current) => current.filter((sourceId) => sourceId !== id));
    setPages((current) => current.filter((page) => page.sourceId !== id));
    setNotice("");
    setError("");
  }

  async function exportPages(selectedOnly: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const bytes = await buildPdf(sources, pages, selectedOnly);
      const first = sourcesInOrder[0];
      const name = selectedOnly
        ? `${fileStem(first?.name ?? "pages")}-selected.pdf`
        : sources.length === 1 ? `${fileStem(first?.name ?? "document")}-edited.pdf` : "merged.pdf";
      downloadBlob(bytesBlob(bytes, "application/pdf"), name);
      setNotice(`Downloaded ${selectedOnly ? selectedCount : pages.length} page${(selectedOnly ? selectedCount : pages.length) === 1 ? "" : "s"}.`);
    } catch (caught) {
      setError(messageOf(caught, "Could not create the PDF"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>PDF merge &amp; split</h1>
        <p className="lede">Merge PDFs, reorder and rotate pages, or select a subset to split into a new PDF. Files stay in this browser.</p>
        <Link className="btn ghost" to="/pdf-editor">Open the PDF editor for viewing, markup &amp; signing →</Link>
      </header>
      <div className="workspace report">
        <section className="panel">
          <label className="drop" htmlFor={inputId}>
            <input
              id={inputId}
              className="hidden-file"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              disabled={busy}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <div><strong>Add PDFs</strong>Choose one or more files. Up to 30 MB each, 75 MB total, and 200 pages.</div>
          </label>
          {error && <p role="alert" className="lede" style={{ marginTop: 16 }}>{error}</p>}
          {notice && <p role="status" className="lede" style={{ marginTop: 16 }}>{notice}</p>}
          {sources.length > 0 && (
            <>
              <h2 style={{ marginTop: 20 }}>File order</h2>
              <p className="lede">Moving a file regroups all of its pages. Use page controls below for the final order.</p>
              <div className="stack">
                {sourcesInOrder.map((source, index) => (
                  <div className="stat" key={source.id}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span style={{ textTransform: "none", letterSpacing: 0 }}>{index + 1}. {source.name} · {source.pageCount} page{source.pageCount === 1 ? "" : "s"} · {formatBytes(source.bytes.byteLength)}</span>
                      <span className="row">
                        <button className="btn ghost" type="button" disabled={busy || index === 0} onClick={() => reorderSource(source.id, -1)} aria-label={`Move ${source.name} up`}>↑</button>
                        <button className="btn ghost" type="button" disabled={busy || index === sourcesInOrder.length - 1} onClick={() => reorderSource(source.id, 1)} aria-label={`Move ${source.name} down`}>↓</button>
                        <button className="btn ghost" type="button" disabled={busy} onClick={() => removeSource(source.id)}>Remove</button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
        {pages.length > 0 && (
          <section className="panel">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <h2>Page order</h2>
                <p className="lede" style={{ margin: 0 }}>{pages.length} pages · {selectedCount} selected · {formatBytes(totalBytes)} loaded</p>
              </div>
              <div className="row">
                <button className="btn ghost" type="button" disabled={busy} onClick={() => setPages((current) => current.map((page) => ({ ...page, selected: true })))}>Select all</button>
                <button className="btn ghost" type="button" disabled={busy} onClick={() => setPages((current) => current.map((page) => ({ ...page, selected: false })))}>Select none</button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="meta-table">
                <thead><tr><th>Select</th><th>Output</th><th>Source page</th><th>Rotation</th><th>Controls</th></tr></thead>
                <tbody>
                  {pages.map((page, index) => {
                    const source = sources.find((item) => item.id === page.sourceId);
                    return (
                      <tr key={page.id}>
                        <td><input type="checkbox" checked={page.selected} disabled={busy} aria-label={`Include output page ${index + 1}`} onChange={(event) => setPages((current) => current.map((item) => item.id === page.id ? { ...item, selected: event.target.checked } : item))} /></td>
                        <td>{index + 1}</td>
                        <td>{source?.name ?? "Missing file"} · p. {page.sourcePageIndex + 1}</td>
                        <td>{normalizeQuarterTurn(page.rotation)}°</td>
                        <td>
                          <div className="row">
                            <button className="btn ghost" type="button" disabled={busy || index === 0} aria-label={`Move output page ${index + 1} up`} onClick={() => setPages((current) => moveItem(current, index, -1))}>↑</button>
                            <button className="btn ghost" type="button" disabled={busy || index === pages.length - 1} aria-label={`Move output page ${index + 1} down`} onClick={() => setPages((current) => moveItem(current, index, 1))}>↓</button>
                            <button className="btn ghost" type="button" disabled={busy} aria-label={`Rotate output page ${index + 1} left`} onClick={() => setPages((current) => current.map((item) => item.id === page.id ? { ...item, rotation: normalizeQuarterTurn(item.rotation - 90) } : item))}>↶ 90°</button>
                            <button className="btn ghost" type="button" disabled={busy} aria-label={`Rotate output page ${index + 1} right`} onClick={() => setPages((current) => current.map((item) => item.id === page.id ? { ...item, rotation: normalizeQuarterTurn(item.rotation + 90) } : item))}>↷ 90°</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn" type="button" disabled={busy || pages.length === 0} onClick={() => void exportPages(false)}>{busy ? "Building…" : "Download all pages"}</button>
              <button className="btn ghost" type="button" disabled={busy || selectedCount === 0} onClick={() => void exportPages(true)}>Download selected PDF</button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

export function ImagePaletteTool() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteFrameRef = useRef<ImageData | null>(null);
  const operationRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [colorCount, setColorCount] = useState(8);
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [picked, setPicked] = useState("#000000");
  const [pickedAlpha, setPickedAlpha] = useState(255);
  const [coordinate, setCoordinate] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshPalette = useCallback((frame: ImageData, count: number) => {
    setPalette(extractPalette(frame.data, { colorCount: count, maxSamples: 60_000, minAlpha: 24 }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      operationRef.current += 1;
      paletteFrameRef.current = null;
      if (canvas) { canvas.width = 1; canvas.height = 1; }
    };
  }, []);

  async function takeFile(next: File) {
    const operation = ++operationRef.current;
    let image: HTMLImageElement | undefined;
    setBusy(true);
    setError("");
    setPalette([]);
    setFile(null);
    setSize({ width: 0, height: 0 });
    paletteFrameRef.current = null;
    if (canvasRef.current) {
      canvasRef.current.width = 1;
      canvasRef.current.height = 1;
    }
    try {
      assertImageFile(next);
      image = await loadImage(next);
      if (operation !== operationRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas is not available");
      const paletteFrame = drawPickerPreview(image, canvas);
      paletteFrameRef.current = paletteFrame;
      setFile(next);
      setSize({ width: image.naturalWidth, height: image.naturalHeight });
      const center = { x: Math.floor(image.naturalWidth / 2), y: Math.floor(image.naturalHeight / 2) };
      setCoordinate(center);
      refreshPalette(paletteFrame, colorCount);
      const pixel = readOriginalImagePixel(image, center.x, center.y).data;
      setPicked(rgbToHex({ r: pixel[0] ?? 0, g: pixel[1] ?? 0, b: pixel[2] ?? 0 }));
      setPickedAlpha(pixel[3] ?? 255);
    } catch (caught) {
      if (operation !== operationRef.current) return;
      paletteFrameRef.current = null;
      setPalette([]);
      if (canvasRef.current) { canvasRef.current.width = 1; canvasRef.current.height = 1; }
      setFile(null);
      setSize({ width: 0, height: 0 });
      setError(messageOf(caught, "Could not inspect that image"));
    } finally {
      image?.removeAttribute("src");
      if (operation === operationRef.current) setBusy(false);
    }
  }

  useEffect(() => {
    const frame = paletteFrameRef.current;
    if (!frame) return;
    try { refreshPalette(frame, colorCount); }
    catch (caught) { setError(messageOf(caught, "Could not extract a palette")); }
  }, [colorCount, refreshPalette]);

  async function pickPixel(x: number, y: number) {
    if (!file || busy) return;
    const operation = ++operationRef.current;
    let image: HTMLImageElement | undefined;
    setBusy(true);
    setError("");
    try {
      image = await loadImage(file);
      if (operation !== operationRef.current) return;
      const pixel = readOriginalImagePixel(image, x, y);
      setCoordinate({ x: pixel.x, y: pixel.y });
      setPicked(rgbToHex({ r: pixel.data[0] ?? 0, g: pixel.data[1] ?? 0, b: pixel.data[2] ?? 0 }));
      setPickedAlpha(pixel.data[3] ?? 255);
    } catch (caught) {
      if (operation === operationRef.current) setError(messageOf(caught, "Could not read that pixel"));
    } finally {
      image?.removeAttribute("src");
      if (operation === operationRef.current) setBusy(false);
    }
  }

  const pickedRgb = hexToRgb(picked);
  const alphaFraction = pickedAlpha / 255;
  const formattedAlpha = Number(alphaFraction.toFixed(3));
  const pickedFormats = [
    ["HEX", picked],
    ["RGB", formatRgb(pickedRgb)],
    ["HSL", formatHsl(pickedRgb)],
    ["RGBA", `rgba(${pickedRgb.r}, ${pickedRgb.g}, ${pickedRgb.b}, ${formattedAlpha})`],
  ] as const;

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Image color picker</h1>
        <p className="lede">Pick an exact pixel and extract a compact color palette without uploading the image.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <DropZone disabled={busy} label="Drop an image" hint="PNG, JPEG, WebP, GIF, BMP, or AVIF. Maximum 20 MB and 40 megapixels." onFile={takeFile} />
          {error && <p role="alert" className="lede" style={{ marginTop: 16 }}>{error}</p>}
          <p className="lede" style={{ marginTop: 16 }}>{file ? `${file.name} · ${formatBytes(file.size)} · ${size.width}×${size.height}` : "Waiting for an image."}</p>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={file ? `Color-picking canvas for ${file.name}` : "Image color picker"}
            style={{ display: file ? "block" : "none", maxWidth: "100%", height: "auto", cursor: "crosshair", borderRadius: 6 }}
            onClick={(event) => {
              const canvas = event.currentTarget;
              const bounds = canvas.getBoundingClientRect();
              pickPixel((event.clientX - bounds.left) * size.width / bounds.width, (event.clientY - bounds.top) * size.height / bounds.height);
            }}
          />
          {file && (
            <div className="stack" style={{ marginTop: 16 }}>
              <div className="stat-grid">
                <label className="field"><span>Pixel X</span><input type="number" min={0} max={Math.max(0, size.width - 1)} value={coordinate.x} onChange={(event) => setCoordinate((current) => ({ ...current, x: Number(event.target.value) }))} /></label>
                <label className="field"><span>Pixel Y</span><input type="number" min={0} max={Math.max(0, size.height - 1)} value={coordinate.y} onChange={(event) => setCoordinate((current) => ({ ...current, y: Number(event.target.value) }))} /></label>
              </div>
              <div className="row">
                <button className="btn ghost" type="button" disabled={busy} onClick={() => pickPixel(coordinate.x, coordinate.y)}>Read pixel</button>
                <span aria-label={`Picked color ${picked} at ${Math.round(alphaFraction * 100)} percent opacity`} style={{ display: "inline-block", width: 42, height: 42, borderRadius: 4, border: "1px solid var(--line-strong)", background: `rgba(${pickedRgb.r}, ${pickedRgb.g}, ${pickedRgb.b}, ${formattedAlpha})` }} />
              </div>
              {pickedAlpha < 255 && <p className="lede" style={{ margin: 0 }}>{pickedAlpha === 0 ? "This pixel is fully transparent" : `Alpha: ${Math.round(alphaFraction * 100)}% (${pickedAlpha}/255)`}. RGB channels can still contain a color underneath.</p>}
              <div className="stack">
                {pickedFormats.map(([label, value]) => (
                  <div className="stat" key={label}>
                    <span>{label}</span>
                    <b className="wrap">{value}</b>
                    <div className="row" style={{ marginTop: 8 }}><CopyButton text={value} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className="panel">
          <label className="field">
            <span>Palette colors</span>
            <select value={colorCount} disabled={!file || busy} onChange={(event) => setColorCount(Number(event.target.value))}>
              {[4, 6, 8, 10, 12].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>
          <div className="stack" style={{ marginTop: 16 }} aria-live="polite">
            {palette.length === 0 && <p className="lede">{file ? "No visible pixels were found." : "Dominant colors appear here."}</p>}
            {palette.map((color) => (
              <button
                className="btn ghost"
                type="button"
                key={color.hex}
                onClick={() => { setPicked(color.hex); setPickedAlpha(255); }}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", background: color.hex, color: contrastTextColor(color.rgb), borderColor: "transparent" }}
                aria-label={`Use ${color.hex}, ${Math.round(color.share * 100)} percent of sampled pixels`}
              >
                <span>{color.hex}</span><span>{Math.round(color.share * 100)}%</span>
              </button>
            ))}
          </div>
          {palette.length > 0 && <div className="row" style={{ marginTop: 16 }}><CopyButton text={palette.map((color) => color.hex).join("\n")} /></div>}
        </section>
      </div>
    </>
  );
}

export function FaviconTool() {
  const [file, setFile] = useState<File | null>(null);
  const [appName, setAppName] = useState("My website");
  const [padding, setPadding] = useState(8);
  const [transparent, setTransparent] = useState(true);
  const [background, setBackground] = useState("#ffffff");
  const [archive, setArchive] = useState<Blob | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sourcePreview = useObjectUrl(file);
  const resultPreview = useObjectUrl(previewBlob);
  const snippet = faviconHtmlSnippet();

  async function takeFile(next: File) {
    setBusy(true);
    setError("");
    setArchive(null);
    setPreviewBlob(null);
    try {
      assertImageFile(next);
      const image = await loadImage(next);
      assertImageDimensions(image.naturalWidth, image.naturalHeight);
      setFile(next);
    } catch (caught) {
      setFile(null);
      setError(messageOf(caught, "Could not read that image"));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!file) return;
    setBusy(true);
    setError("");
    setArchive(null);
    setPreviewBlob(null);
    try {
      const image = await loadImage(file);
      const entries: FaviconPng[] = [];
      let preview: Blob | null = null;
      for (const spec of FAVICON_PNG_SPECS) {
        const canvas = document.createElement("canvas");
        canvas.width = spec.size;
        canvas.height = spec.size;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is not available");
        context.clearRect(0, 0, spec.size, spec.size);
        if (!transparent) {
          context.fillStyle = background;
          context.fillRect(0, 0, spec.size, spec.size);
        }
        const inset = spec.size * padding / 100;
        const available = Math.max(1, spec.size - inset * 2);
        const scale = Math.min(available / image.naturalWidth, available / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, (spec.size - width) / 2, (spec.size - height) / 2, width, height);
        const encoded = await canvasPng(canvas);
        entries.push({ name: spec.name, size: spec.size, data: encoded.data });
        if (spec.size === 192) preview = encoded.blob;
      }
      const zipped = await buildFaviconZip(entries, appName);
      setArchive(bytesBlob(zipped, "application/zip"));
      setPreviewBlob(preview);
    } catch (caught) {
      setError(messageOf(caught, "Could not generate favicon files"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Favicon generator</h1>
        <p className="lede">Create common PNG icons, a multi-size favicon.ico, a web manifest, and ready-to-paste HTML in one ZIP.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <DropZone disabled={busy} label="Drop a logo" hint="A square PNG with transparency works best. Processing stays in this browser." onFile={takeFile} />
          {error && <p role="alert" className="lede" style={{ marginTop: 16 }}>{error}</p>}
          <fieldset disabled={busy} className="stack" style={{ marginTop: 16 }}>
            <label className="field"><span>Website name</span><input value={appName} maxLength={80} onChange={(event) => { setAppName(event.target.value); setArchive(null); }} /></label>
            <label className="field"><span>Padding · {padding}%</span><input className="range" type="range" min={0} max={24} value={padding} onChange={(event) => { setPadding(Number(event.target.value)); setArchive(null); }} /></label>
            <label className="row"><input type="checkbox" checked={transparent} onChange={(event) => { setTransparent(event.target.checked); setArchive(null); }} />Transparent background</label>
            <label className="field"><span>Background color</span><input type="color" value={background} disabled={transparent} onChange={(event) => { setBackground(event.target.value); setArchive(null); }} /></label>
            <div className="row">
              <button className="btn" type="button" disabled={!file || busy} onClick={() => void generate()}>{busy ? "Generating…" : "Generate package"}</button>
              {archive && <button className="btn ghost" type="button" onClick={() => downloadBlob(archive, "favicon-package.zip")}>Download ZIP</button>}
            </div>
          </fieldset>
        </section>
        <section className="panel">
          <div className="preview-frame">{(resultPreview || sourcePreview) && <img src={resultPreview || sourcePreview} alt={resultPreview ? "Generated favicon preview" : "Source logo"} />}</div>
          <p className="lede" style={{ marginTop: 16 }}>{archive ? `Package ready · ${formatBytes(archive.size)} · ${FAVICON_PNG_SPECS.length} PNG sizes plus ICO` : file ? `${file.name} · ${formatBytes(file.size)}` : "Waiting for a logo."}</p>
          <label className="field"><span>HTML snippet</span><textarea readOnly value={snippet} spellCheck={false} /></label>
          <div className="row"><CopyButton text={snippet} /></div>
        </section>
      </div>
    </>
  );
}
