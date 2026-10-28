import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import {
  pageDisplaySize, pageOverlayTransform, prepareEditorSource, wrapMarkupText, markupContentSize, placeUprightMarkup,
  type EditorPage, type EditorSource, type FormValue, type PdfMarkup, type Point, type MarkupKind,
} from "../lib/pdfEditor";
import { uuidV4 } from "../lib/text";
import { MAX_IMAGE_PIXELS } from "../lib/fileImageTools";

GlobalWorkerOptions.workerSrc = workerUrl;
export type EditorTool = "select" | MarkupKind;

export function usePdfDocuments(sources: EditorSource[], forms: Record<string, Record<string, FormValue>>) {
  const [documents, setDocuments] = useState<Record<string, PDFDocumentProxy>>({});
  const [error, setError] = useState("");
  type Entry = { key: string; task: ReturnType<typeof getDocument>; document: PDFDocumentProxy };
  const cache = useRef<Record<string, Entry>>({});
  useEffect(() => () => { for (const entry of Object.values(cache.current)) void entry.task.destroy(); cache.current = {}; }, []);
  useEffect(() => {
    let cancelled = false;
    const pending = new Set<ReturnType<typeof getDocument>>();
    const timer = window.setTimeout(() => {
      void Promise.all(sources.map(async (source) => {
        const key = JSON.stringify(forms[source.id] ?? {});
        const existing = cache.current[source.id];
        if (existing?.key === key) return [source.id, existing] as const;
        const changed = source.fields.some((f) => JSON.stringify(forms[source.id]?.[f.name] ?? f.value) !== JSON.stringify(f.value));
        const bytes = changed ? await (await prepareEditorSource(source, forms[source.id])).save() : source.bytes;
        if (cancelled) return null;
        const task = getDocument({ data: bytes.slice(), maxImageSize: MAX_IMAGE_PIXELS, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/", iccUrl: "/pdfjs/iccs/", enableXfa: false });
        pending.add(task);
        const document = await task.promise;
        if (cancelled) { void task.destroy(); return null; }
        return [source.id, { key, task, document }] as const;
      })).then((entries) => {
        if (!cancelled) {
          const next = Object.fromEntries(entries.filter((e) => e !== null));
          for (const [id, entry] of Object.entries(cache.current)) if (entry !== next[id]) void entry.task.destroy();
          cache.current = next;
          pending.clear();
          setDocuments(Object.fromEntries(Object.entries(next).map(([id, entry]) => [id, entry.document])));
          setError("");
        }
      }).catch((caught: unknown) => { for (const task of pending) void task.destroy(); pending.clear(); if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not display the PDF."); });
    }, Object.keys(cache.current).length ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); for (const task of pending) void task.destroy(); };
  }, [sources, forms]);
  return { documents, error };
}

let fontPromise: Promise<PDFFont> | undefined;
function previewFont() {
  return fontPromise ??= PDFDocument.create().then((pdf) => pdf.embedFont(StandardFonts.Helvetica));
}

export function MarkupGraphic({ markup: m, font }: { markup: PdfMarkup; font?: PDFFont }) {
  if (m.rotation) {
    const size = markupContentSize(m);
    return <g transform={`translate(${m.x} ${m.y}) ${pageOverlayTransform({ ...size, rotation: m.rotation })}`}><MarkupGraphic markup={{ ...m, ...size, x: 0, y: 0, rotation: 0 }} font={font} /></g>;
  }
  const common = { stroke: m.color, strokeWidth: m.strokeWidth, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (m.kind === "text") {
    const lines = font ? wrapMarkupText(m.text, m.width, m.fontSize, font) : m.text.split("\n");
    return <text x={m.x} y={m.y + m.fontSize} fill={m.color} fontFamily="Arial, Helvetica, sans-serif" fontSize={m.fontSize} xmlSpace="preserve">{lines.slice(0, Math.max(1, Math.floor(m.height / (m.fontSize * 1.2)))).map((line, i) => <tspan key={i} x={m.x} dy={i ? m.fontSize * 1.2 : 0}>{line}</tspan>)}</text>;
  }
  if (m.kind === "highlight") return <rect x={m.x} y={m.y} width={m.width} height={m.height} fill={m.color} opacity={0.3} />;
  if (m.kind === "rectangle") return <rect x={m.x} y={m.y} width={m.width} height={m.height} {...common} />;
  if (m.kind === "ellipse") return <ellipse cx={m.x + m.width / 2} cy={m.y + m.height / 2} rx={m.width / 2} ry={m.height / 2} {...common} />;
  return <g {...common}>{m.paths.map((path, i) => {
    const points = path.map((p) => ({ x: m.x + p.x * m.width, y: m.y + p.y * m.height }));
    const start = points[0], end = points.at(-1);
    const angle = start && end ? Math.atan2(end.y - start.y, end.x - start.x) : 0;
    const length = Math.max(8, m.strokeWidth * 4);
    return <g key={i}>{points.length === 1 ? <circle cx={start?.x} cy={start?.y} r={m.strokeWidth / 2} fill={m.color} stroke="none" /> : <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} />}{m.kind === "arrow" && end && [-1, 1].map((sign) => <line key={sign} x1={end.x} y1={end.y} x2={end.x - length * Math.cos(angle + sign * Math.PI / 6)} y2={end.y - length * Math.sin(angle + sign * Math.PI / 6)} />)}</g>;
  })}</g>;
}

export function PdfPageCanvas({ page, document, width, thumbnail = false }: { page: EditorPage; document?: PDFDocumentProxy; width: number; thumbnail?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(!thumbnail);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!thumbnail || !canvasRef.current) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "200px" });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [thumbnail]);
  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    const canvas = canvasRef.current;
    setError("");
    const size = pageDisplaySize(page);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixels = Math.min(width * dpr, 3000, Math.sqrt(8_000_000 * size.width / size.height));
    if (!page.sourceId) {
      canvas.width = Math.max(1, Math.round(pixels)); canvas.height = Math.max(1, Math.round(pixels * size.height / size.width));
      const ctx = canvas.getContext("2d"); if (ctx) { ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      return;
    }
    if (!document) { canvas.width = 1; canvas.height = 1; return; }
    void Promise.resolve().then(() => document.getPage(page.sourcePageIndex + 1)).then(async (pdfPage) => {
      if (cancelled) return;
      const initial = pdfPage.getViewport({ scale: 1, rotation: page.rotation });
      const viewport = pdfPage.getViewport({ scale: pixels / initial.width, rotation: page.rotation });
      // Render to a private canvas: cancelling and immediately selecting another page never reuses an active canvas.
      const buffer = window.document.createElement("canvas");
      buffer.width = Math.max(1, Math.round(viewport.width)); buffer.height = Math.max(1, Math.round(viewport.height));
      task = pdfPage.render({ canvas: buffer, viewport });
      await task.promise;
      if (!cancelled) { canvas.width = buffer.width; canvas.height = buffer.height; canvas.getContext("2d")?.drawImage(buffer, 0, 0); }
    }).catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not render this page.");
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [page.sourceId, page.sourcePageIndex, page.rotation, page.width, page.height, document, width, visible]);
  return <><canvas ref={canvasRef} className="pdf-page-canvas" aria-label={thumbnail ? "Page thumbnail" : "PDF page content"} />{error && <span role="alert" className="pdf-canvas-error">{error}</span>}</>;
}

export function PdfEditorStage({ page, document, tool, style, selectedId, signature, zoom, onSelect, onAdd, onMove }: {
  page: EditorPage; document?: PDFDocumentProxy; tool: EditorTool;
  style: { color: string; strokeWidth: number; fontSize: number; text: string };
  selectedId: string | null; signature: Point[][]; zoom: number;
  onSelect: (id: string | null) => void; onAdd: (m: PdfMarkup) => void; onMove: (m: PdfMarkup) => void;
}) {
  const container = useRef<HTMLDivElement>(null), group = useRef<SVGGElement>(null);
  const [availableWidth, setAvailableWidth] = useState(650);
  const [font, setFont] = useState<PDFFont>();
  const [draft, setDraft] = useState<PdfMarkup | null>(null);
  const gesture = useRef<{ start: Point; points: Point[]; draft: PdfMarkup; original?: PdfMarkup; resize?: boolean; pointerId: number } | null>(null);
  useEffect(() => { void previewFont().then(setFont); }, []);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setAvailableWidth(Math.max(180, entry.contentRect.width - 48)); });
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { gesture.current = null; setDraft(null); }, [page.id, tool]);
  const size = pageDisplaySize(page);
  const width = Math.min(availableWidth, 900) * zoom;
  function point(event: ReactPointerEvent) {
    const matrix = group.current?.getScreenCTM();
    const p = matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : new DOMPoint();
    return { x: Math.max(0, Math.min(page.width, p.x)), y: Math.max(0, Math.min(page.height, p.y)) };
  }
  function base(kind: MarkupKind, p: Point): PdfMarkup {
    return { id: uuidV4(), kind, ...p, width: 1, height: 1, ...style, paths: [] };
  }
  function down(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || gesture.current) return;
    const p = point(event);
    const target = event.target as Element;
    const id = target.closest("[data-markup]")?.getAttribute("data-markup");
    if (tool === "select") {
      const resize = target.hasAttribute("data-resize");
      const original = page.markups.find((m) => m.id === (resize ? selectedId : id));
      onSelect(original?.id ?? null);
      if (!original) return;
      gesture.current = { start: p, points: [], original, draft: original, resize, pointerId: event.pointerId }; setDraft(original);
    } else if (tool === "text") {
      if (!style.text.trim()) return;
      const m = placeUprightMarkup(page, { ...base("text", p), width: 220, height: 100 });
      const size = markupContentSize(m);
      if (size.width >= 8 && size.height >= m.fontSize) onAdd(m);
      return;
    } else if (tool === "signature") {
      if (!signature.length) return;
      const m = placeUprightMarkup(page, { ...base("signature", p), width: 180, height: 63, paths: signature });
      const size = markupContentSize(m);
      if (size.width >= 8 && size.height >= 8) onAdd(m);
      return;
    } else { const draft = base(tool, p); gesture.current = { start: p, points: [p], draft, pointerId: event.pointerId }; setDraft(draft); onSelect(null); }
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function move(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    const p = point(event);
    if (g.original) {
      if (g.resize) {
        g.draft = { ...g.original, width: Math.max(3, Math.min(page.width - g.original.x, g.original.width + p.x - g.start.x)), height: Math.max(3, Math.min(page.height - g.original.y, g.original.height + p.y - g.start.y)) };
        setDraft(g.draft);
        return;
      }
      g.draft = { ...g.original, x: Math.max(0, Math.min(page.width - g.original.width, g.original.x + p.x - g.start.x)), y: Math.max(0, Math.min(page.height - g.original.height, g.original.y + p.y - g.start.y)) };
      setDraft(g.draft);
      return;
    }
    const points = tool === "ink" ? [...g.points, p] : [g.start, p];
    if (points.length > 5000) return;
    g.points = points;
    const x = Math.min(...points.map((v) => v.x)), y = Math.min(...points.map((v) => v.y));
    const w = Math.max(1, Math.max(...points.map((v) => v.x)) - x), h = Math.max(1, Math.max(...points.map((v) => v.y)) - y);
    g.draft = { ...g.draft, x, y, width: w, height: h, paths: [points.map((v) => ({ x: (v.x - x) / w, y: (v.y - y) / h }))] };
    setDraft(g.draft);
  }
  function finish(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    if (!cancelled) move(event);
    const draft = g.draft;
    gesture.current = null;
    if (!cancelled && draft) {
      if (g.original) { if (g.original.x !== draft.x || g.original.y !== draft.y || g.original.width !== draft.width || g.original.height !== draft.height) onMove(draft); }
      else if (draft.width >= 3 || draft.height >= 3) onAdd(draft);
      else if (tool === "ink") onAdd({ ...draft, paths: [[{ x: 0, y: 0 }]] });
    }
    setDraft(null);
  }
  const selected = draft?.id === selectedId ? draft : page.markups.find((m) => m.id === selectedId);
  return <div className="pdf-stage-scroll" ref={container}>
    <div className={`pdf-sheet tool-${tool}`} style={{ width, aspectRatio: `${size.width}/${size.height}` }}>
      <PdfPageCanvas page={page} document={document} width={width} />
      <svg className="pdf-markup-layer" viewBox={`0 0 ${size.width} ${size.height}`} aria-label="PDF markup canvas" onPointerDown={down} onPointerMove={move} onPointerUp={(e) => finish(e)} onPointerCancel={(e) => finish(e, true)}>
        <g ref={group} transform={pageOverlayTransform(page)}>
          {page.markups.map((m) => <g key={m.id} data-markup={m.id}><MarkupGraphic markup={draft?.id === m.id ? draft : m} font={font} /><rect x={m.x} y={m.y} width={Math.max(5, m.width)} height={Math.max(5, m.height)} fill="transparent" stroke="none" /></g>)}
          {draft && !gesture.current?.original && <MarkupGraphic markup={draft} font={font} />}
          {selected && tool === "select" && <><rect x={selected.x - 3} y={selected.y - 3} width={selected.width + 6} height={selected.height + 6} fill="none" stroke="#168847" strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" /><rect data-resize="true" x={selected.x + selected.width - 5} y={selected.y + selected.height - 5} width={10} height={10} fill="white" stroke="#168847" strokeWidth={1.5} style={{ cursor: "nwse-resize" }} /></>}
        </g>
      </svg>
    </div>
  </div>;
}

export function SignaturePad({ onUse }: { onUse: (paths: Point[][]) => void }) {
  const [paths, setPaths] = useState<Point[][]>([]);
  const active = useRef<number | null>(null);
  function point(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  }
  return <div className="stack"><svg className="pdf-signature-pad" viewBox="0 0 300 105" aria-label="Draw your signature" onPointerDown={(e) => { if (e.button !== 0 || active.current !== null) return; active.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); setPaths((p) => [...p, [point(e)]]); }} onPointerMove={(e) => { if (active.current !== e.pointerId) return; const p = point(e); setPaths((old) => old.map((path, i) => i === old.length - 1 && path.length < 5000 ? [...path, p] : path)); }} onPointerUp={() => { active.current = null; }} onPointerCancel={() => { active.current = null; setPaths((p) => p.slice(0, -1)); }}>
    <path d="M12 83H288" stroke="#ddd" strokeDasharray="4 4" />{paths.map((path, i) => <polyline key={i} points={path.map((p) => `${p.x * 300},${p.y * 105}`).join(" ")} stroke="#161616" strokeWidth="2" fill="none" strokeLinecap="round" />)}
  </svg><div className="row"><button type="button" className="btn ghost" onClick={() => setPaths([])}>Clear</button><button type="button" className="btn" disabled={!paths.some((p) => p.length > 1)} onClick={() => onUse(paths)}>Use signature</button></div></div>;
}
