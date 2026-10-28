import {
  PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList,
  PDFRadioGroup, PDFSignature, PDFDict, PDFName, StandardFonts, LineCapStyle, degrees, rgb,
  type PDFFont,
} from "pdf-lib";
import { MAX_PDF_FILE_BYTES, MAX_PDF_TOTAL_BYTES, MAX_PDF_PAGES, normalizeQuarterTurn } from "./pdfTools.ts";

export type Point = { x: number; y: number };
export type MarkupKind = "text" | "ink" | "signature" | "highlight" | "rectangle" | "ellipse" | "line" | "arrow";
export type PdfMarkup = {
  id: string; kind: MarkupKind; x: number; y: number; width: number; height: number;
  color: string; strokeWidth: number; fontSize: number; text: string;
  paths: Point[][];
};
export type EditorPage = {
  id: string; sourceId: string | null; sourcePageIndex: number;
  width: number; height: number; cropX: number; cropY: number;
  rotation: number; markups: PdfMarkup[];
};
export type FormValue = string | string[] | boolean;
export type EditorField = {
  name: string; kind: "text" | "checkbox" | "choice" | "radio";
  value: FormValue; options: string[]; readOnly: boolean; multiline?: boolean;
  maxLength?: number; multiple?: boolean;
};
export type EditorSource = {
  id: string; name: string; bytes: Uint8Array; fields: EditorField[];
  hasSignatures: boolean; hasXfa: boolean;
};
export type EditorSnapshot = { pages: EditorPage[]; forms: Record<string, Record<string, FormValue>> };

export function blankPage(width = 612, height = 792): EditorPage {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0 && n <= 14400)) throw new Error("Invalid page size.");
  return { id: crypto.randomUUID(), sourceId: null, sourcePageIndex: 0, width, height, cropX: 0, cropY: 0, rotation: 0, markups: [] };
}

export function pageDisplaySize(page: EditorPage) {
  return normalizeQuarterTurn(page.rotation) % 180
    ? { width: page.height, height: page.width }
    : { width: page.width, height: page.height };
}

/** SVG transform from the unrotated, top-left crop coordinates to the displayed page. */
export function pageOverlayTransform(page: EditorPage) {
  switch (normalizeQuarterTurn(page.rotation)) {
    case 90: return `translate(${page.height} 0) rotate(90)`;
    case 180: return `translate(${page.width} ${page.height}) rotate(180)`;
    case 270: return `translate(0 ${page.width}) rotate(270)`;
    default: return "";
  }
}

export function moveEditorPage(pages: readonly EditorPage[], id: string, target: number) {
  const from = pages.findIndex((p) => p.id === id);
  if (from < 0 || !Number.isInteger(target) || target < 0 || target >= pages.length) return [...pages];
  const next = [...pages];
  const [page] = next.splice(from, 1);
  next.splice(target, 0, page!);
  return next;
}

export function duplicateEditorPage(page: EditorPage): EditorPage {
  return { ...page, id: crypto.randomUUID(), markups: page.markups.map((m) => ({ ...m, id: crypto.randomUUID(), paths: m.paths.map((path) => path.map((p) => ({ ...p }))) })) };
}

export function assertPdfText(text: string) {
  // Standard Helvetica uses WinAnsi. Reject unsupported characters before editing/export.
  const extra = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
  for (const character of text) {
    const n = character.codePointAt(0)!;
    if (character === "\n" || (n >= 32 && n <= 126) || (n >= 160 && n <= 255) || extra.includes(character)) continue;
    throw new Error(`The PDF text font does not support “${character}”. Use Latin text, or draw your signature.`);
  }
}

export function wrapMarkupText(text: string, width: number, size: number, font: PDFFont) {
  assertPdfText(text);
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const character of paragraph) {
      if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ""; }
      line += character;
    }
    lines.push(line);
  }
  return lines;
}

export async function readEditorPdf(bytes: Uint8Array, name: string, id = crypto.randomUUID()) {
  if (!bytes.length || bytes.length > MAX_PDF_FILE_BYTES) throw new Error(`${name}: choose a PDF up to 30 MB.`);
  let document: PDFDocument;
  try { document = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.message)) throw new Error(`${name}: password-protected PDFs are not supported.`);
    throw new Error(`${name}: could not read this PDF. It may be damaged or unsupported.`);
  }
  if (!document.getPageCount() || document.getPageCount() > MAX_PDF_PAGES) throw new Error(`Choose a PDF with 1–${MAX_PDF_PAGES} pages.`);
  const form = document.getForm();
  const fields: EditorField[] = [];
  let hasSignatures = document.context.enumerateIndirectObjects().some(([, object]) => object instanceof PDFDict && object.has(PDFName.of("ByteRange")));
  for (const field of form.getFields()) {
    const common = { name: field.getName(), options: [] as string[], readOnly: field.isReadOnly() };
    if (field instanceof PDFTextField && !field.isPassword()) fields.push({ ...common, kind: "text", value: field.getText() ?? "", multiline: field.isMultiline(), maxLength: field.getMaxLength() });
    else if (field instanceof PDFCheckBox) fields.push({ ...common, kind: "checkbox", value: field.isChecked() });
    else if (field instanceof PDFDropdown || field instanceof PDFOptionList) fields.push({ ...common, kind: "choice", value: field.getSelected(), options: field.getOptions(), multiple: field.isMultiselect() });
    else if (field instanceof PDFRadioGroup) fields.push({ ...common, kind: "radio", value: field.getSelected() ?? "", options: field.getOptions() });
    else if (field instanceof PDFSignature) hasSignatures = true;
  }
  const pages: EditorPage[] = document.getPages().map((p, index) => {
    const crop = p.getCropBox(), media = p.getMediaBox();
    const x = Math.max(crop.x, media.x), y = Math.max(crop.y, media.y);
    let width = Math.min(crop.x + crop.width, media.x + media.width) - x;
    let height = Math.min(crop.y + crop.height, media.y + media.height) - y;
    const intersects = width > 0 && height > 0;
    if (!intersects) { width = media.width; height = media.height; }
    if (![width, height].every((n) => Number.isFinite(n) && n > 0 && n <= 14400)) throw new Error(`${name}: unsupported page dimensions.`);
    return { id: crypto.randomUUID(), sourceId: id, sourcePageIndex: index, width, height, cropX: intersects ? x : media.x, cropY: intersects ? y : media.y, rotation: normalizeQuarterTurn(p.getRotation().angle), markups: [] };
  });
  return { source: { id, name, bytes, fields, hasSignatures, hasXfa: form.hasXFA() } satisfies EditorSource, pages };
}

export async function prepareEditorSource(source: EditorSource, values: Record<string, FormValue> = {}) {
  const document = await PDFDocument.load(source.bytes, { updateMetadata: false });
  const form = document.getForm();
  if (form.hasXFA()) form.deleteXFA();
  // Invisible signature widgets often have no appearance stream to flatten.
  // Give them an empty appearance; retain existing visible signature appearances.
  for (const field of form.getFields()) {
    if (!(field instanceof PDFSignature)) continue;
    for (const widget of field.acroField.getWidgets()) {
      if (widget.getAppearances()?.normal) continue;
      const appearance = document.context.flateStream("", { Type: PDFName.of("XObject"), Subtype: PDFName.of("Form"), BBox: [0, 0, 1, 1] });
      widget.setNormalAppearance(document.context.register(appearance));
    }
  }
  for (const item of source.fields) {
    if (item.readOnly || !(item.name in values)) continue;
    const value = values[item.name];
    if (JSON.stringify(value) === JSON.stringify(item.value)) continue;
    const field = form.getField(item.name);
    if (field instanceof PDFTextField) {
      assertPdfText(String(value));
      field.setText(String(value));
    } else if (field instanceof PDFCheckBox) {
      if (value) field.check(); else field.uncheck();
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const selections = Array.isArray(value) ? value : value ? [String(value)] : [];
      if (selections.length) field.select(selections); else field.clear();
    } else if (field instanceof PDFRadioGroup) {
      if (value) field.select(String(value)); else field.clear();
    }
  }
  if (form.getFields().length) {
    form.updateFieldAppearances(await document.embedFont(StandardFonts.Helvetica));
    form.flatten({ updateFieldAppearances: false });
  }
  return document;
}

export async function exportEditorPdf(sources: readonly EditorSource[], snapshot: EditorSnapshot) {
  if (!snapshot.pages.length) throw new Error("Add at least one page before downloading.");
  if (snapshot.pages.length > MAX_PDF_PAGES) throw new Error(`Keep the document under ${MAX_PDF_PAGES} pages.`);
  if (sources.reduce((n, source) => n + source.bytes.length, 0) > MAX_PDF_TOTAL_BYTES) throw new Error("PDFs may total at most 75 MB.");
  const output = await PDFDocument.create();
  const font = await output.embedFont(StandardFonts.Helvetica);
  const prepared = new Map<string, PDFDocument>();
  for (const item of snapshot.pages) {
    let page;
    if (item.sourceId) {
      let document = prepared.get(item.sourceId);
      if (!document) {
        const source = sources.find((s) => s.id === item.sourceId);
        if (!source) throw new Error("A source PDF is missing.");
        document = await prepareEditorSource(source, snapshot.forms[source.id]);
        prepared.set(source.id, document);
      }
      if (!Number.isInteger(item.sourcePageIndex) || item.sourcePageIndex < 0 || item.sourcePageIndex >= document.getPageCount()) throw new Error("A source page is missing.");
      [page] = await output.copyPages(document, [item.sourcePageIndex]);
      output.addPage(page!);
    } else page = output.addPage([item.width, item.height]);
    page!.setRotation(degrees(normalizeQuarterTurn(item.rotation)));
    const toPdf = (p: Point) => ({ x: item.cropX + p.x, y: item.cropY + item.height - p.y });
    for (const m of item.markups) {
      const hex = /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : "#111111";
      const color = rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
      const position = toPdf({ x: m.x, y: m.y + m.height });
      if (m.kind === "text") {
        const lines = wrapMarkupText(m.text, m.width, m.fontSize, font);
        lines.slice(0, Math.max(1, Math.floor(m.height / (m.fontSize * 1.2)))).forEach((line, index) => {
          page!.drawText(line, { ...toPdf({ x: m.x, y: m.y + m.fontSize + index * m.fontSize * 1.2 }), size: m.fontSize, font, color });
        });
      } else if (m.kind === "highlight" || m.kind === "rectangle") {
        page!.drawRectangle({ ...position, width: m.width, height: m.height, ...(m.kind === "highlight" ? { color, opacity: 0.3 } : { borderColor: color, borderWidth: m.strokeWidth }) });
      } else if (m.kind === "ellipse") {
        page!.drawEllipse({ ...toPdf({ x: m.x + m.width / 2, y: m.y + m.height / 2 }), xScale: m.width / 2, yScale: m.height / 2, borderColor: color, borderWidth: m.strokeWidth });
      } else {
        for (const path of m.paths) {
          const points = path.map((p) => toPdf({ x: m.x + p.x * m.width, y: m.y + p.y * m.height }));
          if (points.length === 1) page!.drawCircle({ ...points[0], size: m.strokeWidth / 2, color });
          for (let i = 1; i < points.length; i++) page!.drawLine({ start: points[i - 1]!, end: points[i]!, thickness: m.strokeWidth, color, lineCap: LineCapStyle.Round });
          if (m.kind === "arrow" && points.length >= 2) {
            const start = points[0]!, end = points.at(-1)!;
            const angle = Math.atan2(end.y - start.y, end.x - start.x), length = Math.max(8, m.strokeWidth * 4);
            for (const sign of [-1, 1]) page!.drawLine({ start: end, end: { x: end.x - length * Math.cos(angle + sign * Math.PI / 6), y: end.y - length * Math.sin(angle + sign * Math.PI / 6) }, thickness: m.strokeWidth, color, lineCap: LineCapStyle.Round });
          }
        }
      }
    }
  }
  output.setTitle("Edited PDF"); output.setCreator("WebTools PDF editor"); output.setProducer("WebTools");
  return output.save();
}
