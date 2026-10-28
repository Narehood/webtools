import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFRawStream, PDFString, StandardFonts, decodePDFRawStream, degrees } from "pdf-lib";
import { assertPdfText, blankPage, duplicateEditorPage, exportEditorPdf, moveEditorPage, pageDisplaySize, prepareEditorSource, readEditorPdf, wrapMarkupText, type PdfMarkup } from "../src/lib/pdfEditor.ts";

function markup(kind: PdfMarkup["kind"], overrides: Partial<PdfMarkup> = {}): PdfMarkup {
  return { id: crypto.randomUUID(), kind, x: 20, y: 30, width: 120, height: 60, color: "#112233", fontSize: 16, strokeWidth: 2, text: "Hello PDF", paths: [[{ x: 0, y: 1 }, { x: 1, y: 0 }]], ...overrides };
}

function streams(pdf: PDFDocument) {
  return pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream)) return [];
    return [new TextDecoder().decode(decodePDFRawStream(object).decode())];
  }).join("\n");
}

test("editor exports a reordered mix of source pages, duplicate pages, and a blank page without mutating the original", async () => {
  const original = await PDFDocument.create();
  original.addPage([300, 400]); original.addPage([500, 600]).setRotation(degrees(90));
  const bytes = await original.save();
  const { source, pages } = await readEditorPdf(bytes, "original.pdf");
  const duplicate = duplicateEditorPage(pages[1]!);
  duplicate.rotation = 270;
  duplicate.markups = [markup("text")];
  const added = blankPage(200, 250);
  const moved = moveEditorPage([...pages, duplicate, added], added.id, 0);
  const output = await PDFDocument.load(await exportEditorPdf([source], { pages: [moved[0]!, moved[3]!, moved[2]!], forms: {} }));
  assert.equal(output.getPageCount(), 3);
  assert.deepEqual(output.getPages().map((p) => [p.getWidth(), p.getHeight(), p.getRotation().angle]), [[200, 250, 0], [500, 600, 270], [500, 600, 90]]);
  assert.match(streams(output), /48656C6C6F20504446/); // The added text is in the real PDF content.
  assert.equal((await PDFDocument.load(source.bytes)).getPageCount(), 2);
  assert.equal(pages[1]!.rotation, 90);
});

test("markup exports in crop coordinates and remains attached to the page through rotation", async () => {
  const original = await PDFDocument.create();
  const p = original.addPage([500, 600]);
  p.setCropBox(50, 70, 300, 400); p.setRotation(degrees(90));
  const { source, pages } = await readEditorPdf(await original.save(), "cropped.pdf");
  const page = pages[0]!;
  assert.deepEqual([page.width, page.height, page.cropX, page.cropY], [300, 400, 50, 70]);
  assert.deepEqual(pageDisplaySize(page), { width: 400, height: 300 });
  page.markups = [markup("text"), markup("highlight"), markup("rectangle"), markup("ellipse"), markup("ink"), markup("signature"), markup("line"), markup("arrow")];
  const output = await PDFDocument.load(await exportEditorPdf([source], { pages, forms: {} }));
  assert.equal(output.getPage(0).getRotation().angle, 90);
  assert.deepEqual(output.getPage(0).getCropBox(), { x: 50, y: 70, width: 300, height: 400 });
  const content = streams(output);
  assert.match(content, /70 424 Tm/); // x = cropX + 20; baseline = cropY + height - 30 - 16.
  assert.match(content, /70 380 cm/); // Rectangle's lower left includes the crop offset.
  assert.match(content, /70 380 m/); // Ink begins at top-left + normalized path [0, 1].
  assert.match(content, /190 440 l/);
  assert.match(content, /2 w/);
  assert.match(output.getPage(0).node.Resources()!.toString(), /\/ca 0\.3/);
});

test("form edits become visible content before copying pages, including choices, radios, checkboxes, and read-only values", async () => {
  const original = await PDFDocument.create();
  const page = original.addPage([600, 800]);
  const form = original.getForm();
  const text = form.createTextField("fullName"); text.setText("Original"); text.setMaxLength(80); text.addToPage(page, { x: 20, y: 700, width: 240, height: 30 });
  const check = form.createCheckBox("consent"); check.addToPage(page, { x: 20, y: 650 });
  const choice = form.createDropdown("country"); choice.addOptions(["Canada", "France"]); choice.select("Canada"); choice.addToPage(page, { x: 20, y: 600, width: 200, height: 30 });
  const multi = form.createOptionList("colors"); multi.addOptions(["Red", "Green", "Blue"]); multi.enableMultiselect(); multi.addToPage(page, { x: 20, y: 500, width: 200, height: 70 });
  const radio = form.createRadioGroup("delivery"); radio.addOptionToPage("Mail", page, { x: 20, y: 450 }); radio.addOptionToPage("Pickup", page, { x: 80, y: 450 });
  const locked = form.createTextField("locked"); locked.setText("Keep me"); locked.enableReadOnly(); locked.addToPage(page, { x: 20, y: 400, width: 200, height: 30 });
  const { source, pages } = await readEditorPdf(await original.save(), "form.pdf");
  assert.deepEqual(source.fields.map((f) => f.kind), ["text", "checkbox", "choice", "choice", "radio", "text"]);
  assert.equal(source.fields[0]!.maxLength, 80);
  const values = { fullName: "Ada Lovelace", consent: true, country: "France", colors: ["Green", "Blue"], delivery: "Pickup", locked: "Replace me" };
  const prepared = await PDFDocument.load(await (await prepareEditorSource(source, values)).save());
  assert.equal(prepared.getForm().getFields().length, 0);
  assert.match(streams(prepared), /416461204C6F76656C616365/);
  assert.match(streams(prepared), /4B656570206D65/);
  assert.doesNotMatch(streams(prepared), /5265706C616365206D65/);
  const output = await PDFDocument.load(await exportEditorPdf([source], { pages: [...pages, duplicateEditorPage(pages[0]!)], forms: { [source.id]: values } }));
  assert.equal(output.getPageCount(), 2);
  assert.equal(output.getForm().getFields().length, 0);
  assert.match(streams(output), /416461204C6F76656C616365/);
  assert.equal((await PDFDocument.load(source.bytes)).getForm().getTextField("fullName").getText(), "Original");
});

test("clearing form choices and radios exports successfully, and invalid text produces an actionable error", async () => {
  const original = await PDFDocument.create(); const page = original.addPage(); const form = original.getForm();
  const choice = form.createDropdown("choice"); choice.addOptions(["One", "Two"]); choice.select("One"); choice.addToPage(page);
  const radio = form.createRadioGroup("radio"); radio.addOptionToPage("Yes", page); radio.select("Yes");
  const text = form.createTextField("text"); text.addToPage(page);
  const { source, pages } = await readEditorPdf(await original.save(), "choices.pdf");
  await assert.doesNotReject(exportEditorPdf([source], { pages, forms: { [source.id]: { choice: [], radio: "", text: "Café €" } } }));
  await assert.rejects(prepareEditorSource(source, { text: "こんにちは" }), /font does not support/);
});

test("markup duplication preserves independent paths and multiline text wraps identically for preview and export", async () => {
  const page = blankPage(); page.markups = [markup("signature")];
  const copy = duplicateEditorPage(page);
  copy.markups[0]!.paths[0]![0]!.x = 0.75;
  assert.notEqual(copy.id, page.id); assert.notEqual(copy.markups[0]!.id, page.markups[0]!.id);
  assert.equal(page.markups[0]!.paths[0]![0]!.x, 0);
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = wrapMarkupText("First line\nA longer line to wrap", 65, 12, font);
  assert.equal(lines[0], "First line"); assert.ok(lines.length > 2);
  assert.equal(lines.slice(1).join(""), "A longer line to wrap");
  assert.doesNotThrow(() => assertPdfText("Café £ € – résumé\nSigned"));
  assert.throws(() => assertPdfText("😀"), /font does not support/);
});

test("an invisible digital signature widget does not prevent an edited-copy export", async () => {
  const original = await PDFDocument.create(); const page = original.addPage();
  const dict = original.context.obj({ Type: PDFName.of("Annot"), Subtype: PDFName.of("Widget"), FT: PDFName.of("Sig"), T: PDFString.of("Signature"), Rect: [0, 0, 0, 0], P: page.ref });
  const ref = original.context.register(dict);
  page.node.addAnnot(ref); original.getForm().acroForm.addField(ref);
  const { source, pages } = await readEditorPdf(await original.save(), "invisible-signature.pdf");
  assert.equal(source.hasSignatures, true);
  const output = await PDFDocument.load(await exportEditorPdf([source], { pages, forms: {} }));
  assert.equal(output.getPageCount(), 1);
  assert.equal(output.getForm().getFields().length, 0);
});

test("editor rejects invalid files, missing pages and empty exports, and detects non-form signature dictionaries", async () => {
  await assert.rejects(readEditorPdf(new Uint8Array([1, 2, 3]), "broken.pdf"), /could not read/);
  await assert.rejects(exportEditorPdf([], { pages: [], forms: {} }), /at least one page/);
  const original = await PDFDocument.create(); original.addPage();
  const signature = original.context.obj({ Type: PDFName.of("Sig"), ByteRange: [0, 1, 2, 3] });
  original.catalog.set(PDFName.of("TestSignature"), original.context.register(signature));
  const { source, pages } = await readEditorPdf(await original.save(), "signed.pdf");
  assert.equal(source.hasSignatures, true);
  await assert.rejects(exportEditorPdf([], { pages, forms: {} }), /source PDF is missing/);
  await assert.rejects(exportEditorPdf([source], { pages: [{ ...pages[0]!, sourcePageIndex: 99 }], forms: {} }), /source page is missing/);
  const huge = blankPage();
  await assert.rejects(exportEditorPdf([], { pages: Array(201).fill(huge), forms: {} }), /200 pages/);
});
