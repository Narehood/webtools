import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString, StandardFonts, decodePDFRawStream, degrees } from "pdf-lib";
import { assertPdfText, blankPage, duplicateEditorPage, exportEditorPdf, moveEditorPage, pageDisplaySize, placeUprightMarkup, prepareEditorSource, pruneEditorHistory, readEditorPdf, retainedEditorSourceIds, wrapMarkupText, type EditorHistory, type PdfMarkup } from "../src/lib/pdfEditor.ts";
import { uuidV4 } from "../src/lib/text.ts";

function markup(kind: PdfMarkup["kind"], overrides: Partial<PdfMarkup> = {}): PdfMarkup {
  return { id: uuidV4(), kind, x: 20, y: 30, width: 120, height: 60, color: "#112233", fontSize: 16, strokeWidth: 2, text: "Hello PDF", paths: [[{ x: 0, y: 1 }, { x: 1, y: 0 }]], ...overrides };
}

function streams(pdf: PDFDocument) {
  return pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream)) return [];
    return [new TextDecoder().decode(decodePDFRawStream(object).decode())];
  }).join("\n");
}

test("PDF import, blank pages, and duplication work on LAN HTTP without randomUUID", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  try {
    const original = await PDFDocument.create(); original.addPage();
    const { source, pages } = await readEditorPdf(await original.save(), "lan.pdf");
    const blank = blankPage(); blank.markups = [markup("text")];
    const duplicate = duplicateEditorPage(blank);
    const ids = [source.id, pages[0]!.id, blank.id, blank.markups[0]!.id, duplicate.id, duplicate.markups[0]!.id];
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal((await PDFDocument.load(await exportEditorPdf([source], { pages: [...pages, blank, duplicate], forms: {} }))).getPageCount(), 3);
  } finally {
    if (descriptor) Object.defineProperty(crypto, "randomUUID", descriptor);
    else Reflect.deleteProperty(crypto, "randomUUID");
  }
});

test("text and signatures placed on rotated cropped pages export upright at the clicked position", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const original = await PDFDocument.create(); const p = original.addPage([500, 600]);
    p.setCropBox(50, 70, 300, 400); p.setRotation(degrees(rotation));
    const { source, pages } = await readEditorPdf(await original.save(), "rotated.pdf");
    const page = pages[0]!;
    page.markups = [placeUprightMarkup(page, markup("text", { x: 150, y: 200 })), placeUprightMarkup(page, markup("signature", { x: 150, y: 200, width: 100, height: 35, paths: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]] }))];
    const output = await PDFDocument.load(await exportEditorPdf([source], { pages, forms: {} }));
    const content = streams(output);
    const matrix = content.match(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm/)!.slice(1).map(Number);
    const [a, b, , , x, y] = matrix as [number, number, number, number, number, number];
    const baseline = rotation === 0 ? [a, -b] : rotation === 90 ? [b, a] : rotation === 180 ? [-a, b] : [-b, -a];
    assert.ok(Math.abs(baseline[0]! - 1) < 1e-8 && Math.abs(baseline[1]!) < 1e-8, `text baseline at ${rotation} degrees`);
    function display(pdfX: number, pdfY: number) {
      const cx = pdfX - 50, cy = pdfY - 70;
      return rotation === 0 ? [cx, 400 - cy] : rotation === 90 ? [cy, cx] : rotation === 180 ? [300 - cx, cy] : [400 - cy, 300 - cx];
    }
    const anchor = rotation % 180 ? [200, 150] : [150, 200];
    assert.deepEqual(display(x, y), [anchor[0], anchor[1]! + 16]);
    const moves = [...content.matchAll(/([-\d.]+) ([-\d.]+) ([ml])\n/g)];
    assert.deepEqual(display(Number(moves[0]![1]), Number(moves[0]![2])), anchor);
    const end = moves.at(-1)!;
    assert.deepEqual(display(Number(end[1]), Number(end[2])), [anchor[0]! + 100, anchor[1]! + 35]);
    assert.equal(output.getPage(0).getRotation().angle, rotation);
  }
});

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

test("password values never become visible text when regenerating form appearances", async () => {
  for (const inherited of [false, true]) for (const missingAppearance of [false, true]) {
    const original = await PDFDocument.create(); const page = original.addPage();
    const fieldName = inherited ? "login.pin" : "pin", secret = inherited ? "inherited-secret" : "fixture-secret";
    const pin = original.getForm().createTextField(fieldName); pin.enablePassword(); pin.addToPage(page); pin.setText(secret);
    if (inherited) { pin.acroField.getParent()!.dict.set(PDFName.of("V"), PDFHexString.fromText(secret)); pin.acroField.removeValue(); }
    if (missingAppearance) for (const widget of pin.acroField.getWidgets()) widget.dict.delete(PDFName.of("AP"));
    const normal = original.getForm().createTextField("name"); normal.addToPage(page);
    const { source, pages } = await readEditorPdf(await original.save({ updateFieldAppearances: false }), "password.pdf");
    assert.equal(source.fields.some((field) => field.name === fieldName), false);
    const values = { name: "Updated name" };
    const preview = await PDFDocument.load(await (await prepareEditorSource(source, values)).save());
    const output = await PDFDocument.load(await exportEditorPdf([source], { pages, forms: { [source.id]: values } }));
    const secretHex = Buffer.from(secret).toString("hex").toUpperCase();
    assert.equal(streams(preview).includes(secretHex), false);
    assert.equal(streams(output).includes(secretHex), false);
    assert.match(streams(output), /55706461746564206E616D65/);
    assert.equal((await PDFDocument.load(source.bytes)).getForm().getTextField(fieldName).getText(), secret);
  }
});

test("unreadable rich text and unsupported original field values do not block pages or other form edits", async () => {
  for (const kind of ["unicode", "rich"]) for (const missingAppearance of [false, true]) {
    const original = await PDFDocument.create(); const page = original.addPage(); page.drawText("Original page");
    const field = original.getForm().createTextField("original"); field.setText("Existing appearance"); field.addToPage(page);
    if (kind === "unicode") field.setText("\u3053\u3093\u306b\u3061\u306f");
    else { field.enableRichFormatting(); field.acroField.dict.delete(PDFName.of("V")); }
    if (missingAppearance) for (const widget of field.acroField.getWidgets()) widget.dict.delete(PDFName.of("AP"));
    const editable = original.getForm().createTextField("editable"); editable.addToPage(page);
    const { source, pages } = await readEditorPdf(await original.save({ updateFieldAppearances: false }), "mixed-form.pdf");
    assert.equal(pages.length, 1);
    assert.equal(source.fields.some((field) => field.name === "original"), kind !== "rich");
    pages[0]!.markups = [markup("text", { text: "Added markup" })];
    const output = await PDFDocument.load(await exportEditorPdf([source], { pages, forms: { [source.id]: { editable: "Edited" } } }));
    assert.match(streams(output), /4F726967696E616C2070616765/);
    assert.match(streams(output), /4164646564206D61726B7570/);
    assert.match(streams(output), /456469746564/);
    if (!missingAppearance) assert.match(streams(output), /4578697374696E6720617070656172616E6365/);
    await assert.rejects(prepareEditorSource(source, { editable: "\u3053" }), /editable:.*font does not support/);
  }
});

test("sources remain reachable through undo/redo, then their form data is pruned when history drops them", () => {
  const a = { ...blankPage(), sourceId: "a" }, b = { ...blankPage(), sourceId: "b" };
  const blank = { pages: [blankPage()], forms: { a: { name: "A" }, b: { name: "B" }, orphan: { name: "Discarded" } } };
  const history: EditorHistory = { past: [{ pages: [a], forms: { a: { name: "A" } } }], present: blank, future: [{ pages: [b], forms: { b: { name: "B" } } }] };
  assert.deepEqual([...retainedEditorSourceIds(history)].sort(), ["a", "b"]);
  const retained = pruneEditorHistory(history);
  assert.deepEqual(Object.keys(retained.present.forms), ["a", "b"]);
  assert.equal(retained.past[0], history.past[0]);
  const clearedRedo = pruneEditorHistory({ ...history, past: [], future: [] });
  assert.equal(retainedEditorSourceIds(clearedRedo).size, 0);
  assert.deepEqual(clearedRedo.present.forms, {});
  assert.ok(history.present.forms.orphan); // Pruning does not mutate snapshots still used by undo.
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
