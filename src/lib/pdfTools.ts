export const MAX_PDF_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_PDF_TOTAL_BYTES = 75 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;

export type PdfSourceData = {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
};

export type PdfPagePlan = {
  id: string;
  sourceId: string;
  sourcePageIndex: number;
  selected: boolean;
  rotation: number;
};

export function normalizeQuarterTurn(angle: number) {
  if (!Number.isFinite(angle)) throw new Error("Rotation must be a number");
  const snapped = Math.round(angle / 90) * 90;
  return ((snapped % 360) + 360) % 360;
}

export function moveItem<T>(items: readonly T[], index: number, offset: -1 | 1) {
  const target = index + offset;
  if (!Number.isInteger(index) || index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

export function movePdfSource(
  pages: readonly PdfPagePlan[],
  sourceOrder: readonly string[],
  sourceId: string,
  offset: -1 | 1,
) {
  const index = sourceOrder.indexOf(sourceId);
  const nextOrder = moveItem(sourceOrder, index, offset);
  const grouped = new Map<string, PdfPagePlan[]>();
  for (const page of pages) {
    const group = grouped.get(page.sourceId) ?? [];
    group.push(page);
    grouped.set(page.sourceId, group);
  }
  const known = new Set(nextOrder);
  const reordered = nextOrder.flatMap((id) => grouped.get(id) ?? []);
  reordered.push(...pages.filter((page) => !known.has(page.sourceId)));
  return { pages: reordered, sourceOrder: nextOrder };
}

export async function inspectPdf(bytes: Uint8Array) {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    const pageCount = document.getPageCount();
    if (pageCount < 1) throw new Error("PDF contains no pages");
    return { pageCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF error";
    if (/encrypted/i.test(message)) throw new Error("Encrypted PDFs are not supported");
    if (/contains no pages/i.test(message)) throw error;
    throw new Error("Could not read that PDF. The file may be damaged or unsupported");
  }
}

export async function buildPdf(
  sources: readonly PdfSourceData[],
  plan: readonly PdfPagePlan[],
  selectedOnly = false,
) {
  const pages = selectedOnly ? plan.filter((page) => page.selected) : [...plan];
  if (pages.length === 0) throw new Error(selectedOnly ? "Select at least one page" : "Add at least one page");
  if (pages.length > MAX_PDF_PAGES) throw new Error(`A PDF can contain at most ${MAX_PDF_PAGES} pages here`);

  const { PDFDocument, degrees } = await import("pdf-lib");
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const loaded = new Map<string, Awaited<ReturnType<typeof PDFDocument.load>>>();
  const output = await PDFDocument.create();

  for (const item of pages) {
    const source = sourceById.get(item.sourceId);
    if (!source) throw new Error("A source PDF is missing");
    if (!Number.isInteger(item.sourcePageIndex) || item.sourcePageIndex < 0 || item.sourcePageIndex >= source.pageCount) {
      throw new Error(`Page ${item.sourcePageIndex + 1} is outside ${source.name}`);
    }
    let sourceDocument = loaded.get(source.id);
    if (!sourceDocument) {
      sourceDocument = await PDFDocument.load(source.bytes, { updateMetadata: false });
      loaded.set(source.id, sourceDocument);
    }
    const [copied] = await output.copyPages(sourceDocument, [item.sourcePageIndex]);
    if (!copied) throw new Error("Could not copy a PDF page");
    copied.setRotation(degrees(normalizeQuarterTurn(copied.getRotation().angle + item.rotation)));
    output.addPage(copied);
  }

  output.setProducer("WebTools");
  output.setCreator("WebTools");
  return output.save({ useObjectStreams: true });
}
