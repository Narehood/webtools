import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { ToolFrame } from "../../components/Utility";
import { MarkupGraphic, PdfEditorStage, PdfPageCanvas, SignaturePad, usePdfDocuments, type EditorTool } from "../../components/PdfEditorStage";
import { assertPdfText, blankPage, duplicateEditorPage, exportEditorPdf, markupContentSize, moveEditorPage, pageDisplaySize, pageOverlayTransform, pruneEditorHistory, readEditorPdf, retainedEditorSourceIds, type EditorHistory, type EditorPage, type EditorSnapshot, type EditorSource, type FormValue, type PdfMarkup, type Point } from "../../lib/pdfEditor";
import { MAX_PDF_FILE_BYTES, MAX_PDF_PAGES, MAX_PDF_TOTAL_BYTES, normalizeQuarterTurn } from "../../lib/pdfTools";
import { fileStem } from "../../lib/fileImageTools";
import "./pdf-editor.css";

const EMPTY: EditorSnapshot = { pages: [], forms: {} };
const TOOL_OPTIONS: [EditorTool, string, string][] = [
  ["select", "Select", "Select a markup to move it. Drag its corner handle to resize."],
  ["text", "Text", "Enter text in the inspector, then click the page to place a text box."],
  ["ink", "Draw", "Draw directly on the page with your mouse, pen, or finger."],
  ["highlight", "Highlight", "Drag over an area to add a translucent highlight."],
  ["rectangle", "Rectangle", "Drag to draw a rectangle."],
  ["ellipse", "Oval", "Drag to draw an oval."],
  ["line", "Line", "Drag from the start to the end of a line."],
  ["arrow", "Arrow", "Drag toward the point you want to mark."],
  ["signature", "Sign", "Draw a signature in the inspector, choose Use signature, then click the page."],
];

export default function PdfEditorTool() {
  const [sources, setSources] = useState<EditorSource[]>([]);
  const [history, setHistory] = useState<EditorHistory>({ past: [], present: EMPTY, future: [] });
  const { pages, forms } = history.present;
  const retainedSourceIds = useMemo(() => retainedEditorSourceIds(history), [history]);
  const liveSources = useMemo(() => sources.filter((s) => retainedSourceIds.has(s.id)), [sources, retainedSourceIds]);
  useEffect(() => { if (sources.length !== liveSources.length) setSources(liveSources); }, [sources, liveSources]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>("select");
  const [color, setColor] = useState("#172b4d"), [strokeWidth, setStrokeWidth] = useState(2), [fontSize, setFontSize] = useState(16), [text, setText] = useState("");
  const [signature, setSignature] = useState<Point[][]>([]);
  const [zoom, setZoom] = useState(1), [filename, setFilename] = useState("document-edited");
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"markup" | "forms">("markup");
  const [dragging, setDragging] = useState<string | null>(null), [fileOver, setFileOver] = useState(false);
  const [font, setFont] = useState<PDFFont>();
  const inputRef = useRef<HTMLInputElement>(null), importLock = useRef(false), saved = useRef<EditorSnapshot>(EMPTY);
  const { documents, error: renderError } = usePdfDocuments(liveSources, forms);
  const active = pages.find((p) => p.id === activeId) ?? pages[0];
  const activeIndex = active ? pages.indexOf(active) : -1;
  const selected = active?.markups.find((m) => m.id === selectedId);
  const selectedSize = selected ? markupContentSize(selected) : null;
  const selectedLimit = selected && active ? markupContentSize({ ...selected, width: active.width - selected.x, height: active.height - selected.y }) : null;
  const dirty = history.present !== saved.current;
  const visibleSources = sources.filter((s) => pages.some((p) => p.sourceId === s.id));
  const fieldCount = visibleSources.reduce((n, s) => n + s.fields.length, 0);

  useEffect(() => { void PDFDocument.create().then((pdf) => pdf.embedFont(StandardFonts.Helvetica)).then(setFont); }, []);
  useEffect(() => { setSelectedId(null); }, [active?.id]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function commit(next: EditorSnapshot | ((value: EditorSnapshot) => EditorSnapshot)) {
    setHistory((old) => pruneEditorHistory({ past: [...old.past, old.present].slice(-40), present: typeof next === "function" ? next(old.present) : next, future: [] }));
    setNotice("");
  }
  function undo() {
    if (busy) return;
    setHistory((h) => h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h);
    setSelectedId(null);
  }
  function redo() {
    if (busy) return;
    setHistory((h) => h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h);
    setSelectedId(null);
  }
  function updatePage(update: (page: EditorPage) => EditorPage) {
    if (!active) return;
    commit((s) => ({ ...s, pages: s.pages.map((p) => p.id === active.id ? update(p) : p) }));
  }
  function updateMarkup(changes: Partial<PdfMarkup>) {
    if (!selected) return;
    if (typeof changes.text === "string") { try { assertPdfText(changes.text); } catch (e) { setError(message(e)); return; } }
    updatePage((p) => ({ ...p, markups: p.markups.map((m) => m.id === selected.id ? { ...m, ...changes } : m) }));
    setError("");
  }
  function deleteMarkup() {
    if (!selected) return;
    updatePage((p) => ({ ...p, markups: p.markups.filter((m) => m.id !== selected.id) })); setSelectedId(null);
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest("input,textarea,select") || target.isContentEditable)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      else if (event.key === "Escape") { setTool("select"); setSelectedId(null); }
      else if (!busy && selected && (event.key === "Delete" || event.key === "Backspace")) { event.preventDefault(); deleteMarkup(); }
    }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });

  function message(e: unknown) { return e instanceof Error ? e.message : "Could not edit this PDF."; }
  async function addFiles(files: File[]) {
    if (!files.length || importLock.current) return;
    importLock.current = true; setBusy("Opening PDFs…"); setError("");
    try {
      const addedSources: EditorSource[] = [], addedPages: EditorPage[] = [];
      let total = liveSources.reduce((n, s) => n + s.bytes.length, 0);
      for (const file of files) {
        if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error(`${file.name}: choose a PDF file.`);
        if (file.size > MAX_PDF_FILE_BYTES) throw new Error(`${file.name}: exceeds the 30 MB file limit.`);
        total += file.size;
        if (total > MAX_PDF_TOTAL_BYTES) throw new Error("Loaded PDFs may total at most 75 MB.");
        const result = await readEditorPdf(new Uint8Array(await file.arrayBuffer()), file.name);
        if (pages.length + addedPages.length + result.pages.length > MAX_PDF_PAGES) throw new Error(`Add at most ${MAX_PDF_PAGES} pages.`);
        addedSources.push(result.source); addedPages.push(...result.pages);
      }
      setSources((old) => [...old, ...addedSources]);
      commit((s) => {
        const next = [...s.pages]; next.splice(activeIndex + 1, 0, ...addedPages);
        return { pages: next, forms: { ...s.forms, ...Object.fromEntries(addedSources.map((source) => [source.id, Object.fromEntries(source.fields.map((f) => [f.name, f.value]))])) } };
      });
      setActiveId(addedPages[0]?.id ?? null);
      if (!pages.length) setFilename(`${fileStem(files[0]!.name)}-edited`);
      setNotice(`Added ${addedPages.length} page${addedPages.length === 1 ? "" : "s"}.`);
    } catch (e) { setError(message(e)); }
    finally { setBusy(""); importLock.current = false; }
  }
  function addBlank() {
    if (pages.length >= MAX_PDF_PAGES) { setError(`Add at most ${MAX_PDF_PAGES} pages.`); return; }
    const page = blankPage(active?.width, active?.height);
    commit((s) => { const next = [...s.pages]; next.splice(activeIndex + 1, 0, page); return { ...s, pages: next }; }); setActiveId(page.id);
  }
  function duplicate() {
    if (!active || pages.length >= MAX_PDF_PAGES) return;
    const copy = duplicateEditorPage(active);
    commit((s) => { const next = [...s.pages]; next.splice(activeIndex + 1, 0, copy); return { ...s, pages: next }; }); setActiveId(copy.id);
  }
  function removePage() {
    if (!active) return;
    commit((s) => ({ ...s, pages: s.pages.filter((p) => p.id !== active.id) })); setActiveId(pages[activeIndex + 1]?.id ?? pages[activeIndex - 1]?.id ?? null);
  }
  async function download(currentOnly = false) {
    if (busy || !pages.length) return;
    setBusy("Preparing PDF…"); setError("");
    try {
      const snapshot = history.present;
      const bytes = await exportEditorPdf(liveSources, currentOnly && active ? { ...snapshot, pages: [active] } : snapshot);
      const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "application/pdf" }));
      const link = document.createElement("a"); link.href = url; link.download = `${fileStem(filename || "document-edited")}${currentOnly ? `-page-${activeIndex + 1}` : ""}.pdf`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (!currentOnly) saved.current = snapshot;
      setNotice(currentOnly ? "Downloaded this page with its edits." : "Downloaded your edited PDF.");
    } catch (e) { setError(message(e)); }
    finally { setBusy(""); }
  }
  function chooseTool(value: EditorTool) {
    setTool(value); setSelectedId(null); setTab("markup");
    if (value === "highlight") setColor("#facc15");
    else if (color === "#facc15") setColor("#172b4d");
  }
  function addMarkup(markup: PdfMarkup) {
    updatePage((p) => ({ ...p, markups: [...p.markups, markup] }));
    setSelectedId(markup.id); if (tool !== "ink") setTool("select");
  }
  function changeForm(sourceId: string, name: string, value: FormValue) {
    if (typeof value === "string") { try { assertPdfText(value); } catch (e) { setError(message(e)); return; } }
    commit((s) => ({ ...s, forms: { ...s.forms, [sourceId]: { ...s.forms[sourceId], [name]: value } } })); setError("");
  }

  return <ToolFrame slug="pdf-editor" note="A little like Preview, right in your browser. Arrange pages, fill forms, add text, mark things up, and sign your PDFs.">
    <div className={`pdf-editor${fileOver ? " pdf-file-over" : ""}`} onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); setFileOver(true); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFileOver(false); }} onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); setFileOver(false); if (!busy) void addFiles(Array.from(event.dataTransfer.files)); } }}>
      <input ref={inputRef} className="hidden-file" type="file" accept="application/pdf,.pdf" multiple disabled={Boolean(busy)} aria-label="Open or insert PDFs" onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <div className="pdf-document-bar">
        <div className="row"><button type="button" className="btn" disabled={Boolean(busy)} onClick={() => inputRef.current?.click()}>{pages.length ? "Insert PDF" : "Open PDF"}</button><button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={addBlank}>+ Blank page</button></div>
        <div className="pdf-document-state">{busy || (pages.length ? `${pages.length} page${pages.length === 1 ? "" : "s"} · ${dirty ? "Download to save" : "Downloaded"}` : "Your files stay on this device")}</div>
        <div className="row"><button type="button" className="btn ghost" disabled={Boolean(busy) || !history.past.length} title="Undo (Ctrl/Cmd+Z)" onClick={undo}>Undo</button><button type="button" className="btn ghost" disabled={Boolean(busy) || !history.future.length} title="Redo (Ctrl/Cmd+Shift+Z)" onClick={redo}>Redo</button><button type="button" className="btn" disabled={Boolean(busy) || !pages.length} onClick={() => void download()}>Download PDF</button></div>
      </div>
      {(error || renderError) && <p className="pdf-message pdf-error" role="alert">{error || `Viewer: ${renderError}`}</p>}
      {notice && <p className="pdf-message" role="status">{notice}</p>}
      {visibleSources.some((s) => s.hasSignatures) && <p className="pdf-message">This document contains a digital signature. Export creates an edited copy; its original digital signature will no longer be valid.</p>}
      {visibleSources.some((s) => s.hasXfa) && <p className="pdf-message">XFA forms are not supported. Only standard PDF pages and AcroForm fields can be edited here.</p>}
      {!pages.length ? <section className="pdf-empty"><svg width="64" height="72" viewBox="0 0 64 72" fill="none" aria-hidden="true"><path d="M14 4h26l14 14v48H14zM40 4v16h14M23 32h22M23 41h22M23 50h14" stroke="currentColor" strokeWidth="2" /></svg><h2>Your PDF, with room to work.</h2><p>Drop a PDF here, open one from your device, or start with a blank page.</p><button type="button" className="btn" disabled={Boolean(busy)} onClick={() => inputRef.current?.click()}>Choose a PDF</button><p className="pdf-muted">30 MB per file · 75 MB total · up to 200 pages</p><div className="pdf-feature-list"><span>Arrange pages</span><span>Fill & sign</span><span>Text & markup</span></div></section> : <>
        <fieldset className="pdf-controls" disabled={Boolean(busy)}>
          <div className="pdf-toolbar" role="toolbar" aria-label="PDF markup tools">{TOOL_OPTIONS.map(([value, label, help]) => <button type="button" key={value} className={`pdf-tool${tool === value ? " active" : ""}`} aria-pressed={tool === value} title={help} onClick={() => chooseTool(value)}>{label}</button>)}</div>
          <div className="pdf-workbench">
            <aside className="pdf-pages" aria-label="Document pages"><div className="pdf-pane-heading">Pages <span>{pages.length}</span></div><p className="pdf-muted">Drag to reorder</p><div className="pdf-thumbnail-list">{pages.map((page, index) => {
              const size = pageDisplaySize(page);
              return <button type="button" className={`pdf-thumbnail${active?.id === page.id ? " active" : ""}${dragging === page.id ? " dragging" : ""}`} key={page.id} aria-label={`Page ${index + 1}${page.sourceId ? "" : ", blank"}`} aria-current={active?.id === page.id ? "page" : undefined} draggable onDragStart={(e) => { setDragging(page.id); e.dataTransfer.setData("application/x-webtools-pdf-page", page.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragging(null)} onDragOver={(e) => { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }} onDrop={(e) => { const id = e.dataTransfer.getData("application/x-webtools-pdf-page"); if (id) { e.preventDefault(); e.stopPropagation(); commit((s) => ({ ...s, pages: moveEditorPage(s.pages, id, index) })); setDragging(null); } }} onClick={() => setActiveId(page.id)}>
                <div className="pdf-thumbnail-sheet" style={{ aspectRatio: `${size.width}/${size.height}` }}><PdfPageCanvas page={page} document={page.sourceId ? documents[page.sourceId] : undefined} width={106} thumbnail /><svg viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true"><g transform={pageOverlayTransform(page)}>{page.markups.map((m) => <MarkupGraphic key={m.id} markup={m} font={font} />)}</g></svg></div><span>{index + 1}</span>
              </button>;
            })}</div></aside>
            <section className="pdf-viewer" aria-label="PDF viewer">
              <div className="pdf-viewer-bar"><div className="row"><button type="button" className="pdf-icon-button" aria-label="Previous page" disabled={activeIndex <= 0} onClick={() => setActiveId(pages[activeIndex - 1]!.id)}>‹</button><span>Page {activeIndex + 1} of {pages.length}</span><button type="button" className="pdf-icon-button" aria-label="Next page" disabled={activeIndex === pages.length - 1} onClick={() => setActiveId(pages[activeIndex + 1]!.id)}>›</button></div><div className="row"><button type="button" className="pdf-icon-button" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>−</button><button type="button" className="pdf-zoom" title="Fit page width" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button type="button" className="pdf-icon-button" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>+</button></div></div>
              {active && <PdfEditorStage key={active.id} page={active} document={active.sourceId ? documents[active.sourceId] : undefined} tool={tool} style={{ color, strokeWidth, fontSize, text }} selectedId={selectedId} signature={signature} zoom={zoom} onSelect={setSelectedId} onAdd={addMarkup} onMove={(markup) => updatePage((p) => ({ ...p, markups: p.markups.map((m) => m.id === markup.id ? markup : m) }))} />}
              <p className="pdf-help" role="status">{TOOL_OPTIONS.find(([value]) => value === tool)?.[2]}</p>
              <div className="pdf-page-actions"><button type="button" className="btn ghost" disabled={activeIndex <= 0} onClick={() => commit((s) => ({ ...s, pages: moveEditorPage(s.pages, active!.id, activeIndex - 1) }))}>Move earlier</button><button type="button" className="btn ghost" disabled={activeIndex === pages.length - 1} onClick={() => commit((s) => ({ ...s, pages: moveEditorPage(s.pages, active!.id, activeIndex + 1) }))}>Move later</button><button type="button" className="btn ghost" onClick={() => updatePage((p) => ({ ...p, rotation: normalizeQuarterTurn(p.rotation + 90) }))}>Rotate ↻</button><button type="button" className="btn ghost" disabled={pages.length >= MAX_PDF_PAGES} onClick={duplicate}>Duplicate</button><button type="button" className="btn ghost pdf-danger" onClick={removePage}>Remove page</button></div>
            </section>
            <aside className="pdf-inspector"><div className="pdf-tabs"><button type="button" className={tab === "markup" ? "active" : ""} aria-pressed={tab === "markup"} onClick={() => setTab("markup")}>Markup</button><button type="button" className={tab === "forms" ? "active" : ""} aria-pressed={tab === "forms"} onClick={() => setTab("forms")}>Forms {fieldCount > 0 && `(${fieldCount})`}</button></div>
              {tab === "markup" ? <div className="stack pdf-inspector-content">
                <h2>{selected ? `${selected.kind === "ink" ? "Drawing" : selected.kind[0]!.toUpperCase() + selected.kind.slice(1)} selected` : "Make your mark"}</h2>
                <label className="field"><span>Color</span><input type="color" value={selected?.color ?? color} onChange={(e) => { if (selected) updateMarkup({ color: e.target.value }); else setColor(e.target.value); }} /></label>
                <label className="field"><span>Stroke width</span><input type="range" min={0.5} max={12} step={0.5} value={selected?.strokeWidth ?? strokeWidth} onChange={(e) => { if (selected) updateMarkup({ strokeWidth: Number(e.target.value) }); else setStrokeWidth(Number(e.target.value)); }} /><small>{selected?.strokeWidth ?? strokeWidth} pt</small></label>
                {(tool === "text" || selected?.kind === "text") && <><label className="field"><span>Text</span><textarea className="pdf-text-input" rows={4} value={selected?.kind === "text" ? selected.text : text} placeholder="Type something, then click the page…" onChange={(e) => { if (selected) updateMarkup({ text: e.target.value }); else { try { assertPdfText(e.target.value); setText(e.target.value); setError(""); } catch (caught) { setError(message(caught)); } } }} /></label><label className="field"><span>Font size (pt)</span><input type="number" min={6} max={96} value={selected?.fontSize ?? fontSize} onChange={(e) => { const size = Number(e.target.value); if (size >= 6 && size <= 96) { if (selected) updateMarkup({ fontSize: size }); else setFontSize(size); } }} /></label><p className="pdf-muted">Helvetica · Latin text. Text wraps within the box; increase its height for more lines.</p></>}
                {tool === "signature" && <><p className="pdf-muted">Draw below. Your signature stays in this tab.</p><SignaturePad onUse={(paths) => { setSignature(paths); setNotice("Signature ready. Click the page to place it."); }} />{signature.length > 0 && <p className="pdf-muted">Signature ready to place. Resize it after selecting it.</p>}<p className="pdf-muted">Adds a handwritten mark, rather than a certificate signature.</p></>}
                {selected && selectedSize && selectedLimit && <><div className="pdf-size-fields"><label className="field"><span>Width (pt)</span><input type="number" min={1} max={selectedLimit.width} value={Math.round(selectedSize.width)} onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= selectedLimit.width) updateMarkup(markupContentSize({ ...selectedSize, width: n, rotation: selected.rotation })); }} /></label><label className="field"><span>Height (pt)</span><input type="number" min={1} max={selectedLimit.height} value={Math.round(selectedSize.height)} onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= selectedLimit.height) updateMarkup(markupContentSize({ ...selectedSize, height: n, rotation: selected.rotation })); }} /></label></div><p className="pdf-muted">Drag the selected markup to move it. Delete removes it.</p><button type="button" className="btn ghost pdf-danger" onClick={deleteMarkup}>Delete markup</button></>}
                {active && active.markups.length > 0 && <div className="pdf-markup-list"><h3>On this page</h3>{active.markups.map((m, i) => <button type="button" key={m.id} className={m.id === selectedId ? "active" : ""} onClick={() => { setSelectedId(m.id); setTool("select"); }}>{i + 1}. {m.kind === "text" ? m.text.slice(0, 25) || "Text" : m.kind}</button>)}</div>}
              </div> : <div className="stack pdf-inspector-content"><h2>Fill in this document</h2><p className="pdf-muted">Field changes appear on the page. Filled forms are flattened when downloaded.</p>{!fieldCount && <p className="pdf-muted">No standard form fields found. Use Text to fill in a flat or scanned form.</p>}{visibleSources.filter((s) => s.fields.length).map((source) => <div className="stack" key={source.id}><h3 className="pdf-source-name">{source.name}</h3>{source.fields.map((field) => {
                const value = forms[source.id]?.[field.name] ?? field.value;
                return <label key={field.name} className={field.kind === "checkbox" ? "pdf-form-check" : "field"}><span>{field.name}{field.readOnly ? " (read only)" : ""}</span>{field.kind === "checkbox" ? <input type="checkbox" disabled={field.readOnly} checked={Boolean(value)} onChange={(e) => changeForm(source.id, field.name, e.target.checked)} /> : field.kind === "choice" || field.kind === "radio" ? <select disabled={field.readOnly} multiple={field.multiple} value={field.multiple ? (Array.isArray(value) ? value : [String(value)]) : (Array.isArray(value) ? value[0] ?? "" : String(value))} onChange={(e) => changeForm(source.id, field.name, field.multiple ? Array.from(e.target.selectedOptions, (o) => o.value) : e.target.value)}>{!field.multiple && <option value="">Choose…</option>}{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.multiline ? <textarea rows={3} disabled={field.readOnly} maxLength={field.maxLength} value={String(value)} onChange={(e) => changeForm(source.id, field.name, e.target.value)} /> : <input type="text" disabled={field.readOnly} maxLength={field.maxLength} value={String(value)} onChange={(e) => changeForm(source.id, field.name, e.target.value)} />}</label>;
              })}</div>)}</div>}
            </aside>
          </div>
        </fieldset>
        <div className="pdf-export-bar"><label className="field"><span>Download filename</span><input value={filename} onChange={(e) => setFilename(e.target.value)} /></label><button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => void download(true)}>Download this page</button><p className="pdf-muted">Download saves a new copy with visible markup and filled forms. Original page text stays intact; add a text box to write over a form.</p></div>
      </>}
      <div className="pdf-footer"><span>Local processing · download your work before leaving this tool</span><Link to="/pdf">Need just merge & split? →</Link></div>
    </div>
  </ToolFrame>;
}
