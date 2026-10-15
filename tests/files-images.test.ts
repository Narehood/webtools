import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument, degrees } from "pdf-lib";
import QRCode from "qrcode";
import jsQR from "jsqr";
import {
  assertImageDimensions,
  assertImageFile,
  fileStem,
  fitImageDimensions,
  safeHttpHref,
} from "../src/lib/fileImageTools.ts";
import {
  FAVICON_PNG_SPECS,
  buildFaviconZip,
  buildPngIco,
  faviconHtmlSnippet,
} from "../src/lib/favicon.ts";
import { extractPalette, hexToRgb, rgbToHex } from "../src/lib/imagePalette.ts";
import {
  buildPdf,
  inspectPdf,
  moveItem,
  movePdfSource,
  normalizeQuarterTurn,
  type PdfPagePlan,
} from "../src/lib/pdfTools.ts";

test("image input helpers enforce local processing bounds and safe decoded links", () => {
  assert.doesNotThrow(() => assertImageFile({ name: "code.png", size: 1024, type: "image/png" } as File));
  assert.doesNotThrow(() => assertImageFile({ name: "camera.JPG", size: 1024, type: "" } as File));
  assert.throws(() => assertImageFile({ name: "vector.svg", size: 1024, type: "image/svg+xml" } as File), /PNG, JPEG/);
  assert.throws(() => assertImageFile({ name: "huge.png", size: 21 * 1024 * 1024, type: "image/png" } as File), /too large/);
  assert.throws(() => assertImageDimensions(10_000, 10_000), /too many pixels/);
  assert.deepEqual(fitImageDimensions(8000, 4000, 4_000_000, 2048), { width: 2048, height: 1024, scale: 0.256 });
  assert.equal(safeHttpHref("https://example.com/path"), "https://example.com/path");
  assert.equal(safeHttpHref("javascript:alert(1)"), null);
  assert.equal(safeHttpHref("mailto:test@example.com"), null);
  assert.equal(fileStem("My photo.final.PNG"), "My-photo-final");
});

test("QR reader dependency decodes a generated RGBA fixture", () => {
  const expected = "https://example.com/qr-fixture?local=true";
  const qr = QRCode.create(expected, { errorCorrectionLevel: "M" });
  const quietModules = 4;
  const scale = 5;
  const dimension = (qr.modules.size + quietModules * 2) * scale;
  const rgba = new Uint8ClampedArray(dimension * dimension * 4);
  rgba.fill(255);
  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const pixelX = (column + quietModules) * scale + x;
          const pixelY = (row + quietModules) * scale + y;
          const index = (pixelY * dimension + pixelX) * 4;
          rgba[index] = 0;
          rgba[index + 1] = 0;
          rgba[index + 2] = 0;
        }
      }
    }
  }
  assert.equal(jsQR(rgba, dimension, dimension)?.data, expected);
});

test("palette extraction is deterministic, alpha-aware, and validates input", () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
    255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255,
    0, 255, 0, 0,
  ]);
  const palette = extractPalette(pixels, { colorCount: 2, maxSamples: 8, minAlpha: 16 });
  assert.deepEqual(palette.map((color) => color.hex), ["#ff0000", "#0000ff"]);
  assert.equal(palette[0]?.share, 0.75);
  assert.equal(palette[1]?.share, 0.25);
  assert.deepEqual(hexToRgb("#1ea54c"), { r: 30, g: 165, b: 76 });
  assert.equal(rgbToHex({ r: 30, g: 165, b: 76 }), "#1ea54c");
  assert.throws(() => extractPalette(new Uint8Array([0, 0, 0])), /multiple of 4/);
  assert.deepEqual(extractPalette(new Uint8Array([1, 2, 3, 0]), { minAlpha: 1 }), []);
});

function fakePng(size: number) {
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, size & 255, 1, 2, 3]);
}

test("favicon packaging builds valid ICO directory offsets and a complete ZIP", async () => {
  const ico = buildPngIco([16, 32, 48].map((size) => ({ size, data: fakePng(size) })));
  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
  assert.equal(view.getUint16(0, true), 0);
  assert.equal(view.getUint16(2, true), 1);
  assert.equal(view.getUint16(4, true), 3);
  assert.equal(ico[6], 16);
  assert.equal(view.getUint32(6 + 12, true), 6 + 3 * 16);
  assert.equal(view.getUint32(6 + 16 + 12, true), 6 + 3 * 16 + fakePng(16).byteLength);

  const pngs = FAVICON_PNG_SPECS.map((spec) => ({ ...spec, data: fakePng(spec.size) }));
  const archive = unzipSync(await buildFaviconZip(pngs, "Test app"));
  for (const spec of FAVICON_PNG_SPECS) assert.ok(archive[spec.name]);
  assert.ok(archive["favicon.ico"]);
  assert.match(strFromU8(archive["favicon.html"]!), /favicon-32x32\.png/);
  assert.equal(JSON.parse(strFromU8(archive["site.webmanifest"]!)).name, "Test app");
  assert.match(faviconHtmlSnippet("/assets"), /href="\/assets\/favicon\.ico"/);
  assert.throws(() => buildPngIco([{ size: 16, data: new Uint8Array([1, 2, 3]) }]), /not a PNG/);
});

async function samplePdf(pageCount: number, firstRotation = 0) {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage([300 + index, 500 + index]);
    if (index === 0 && firstRotation) page.setRotation(degrees(firstRotation));
  }
  return document.save();
}

test("PDF plans reorder source blocks and compose selected pages with rotation", async () => {
  const aBytes = await samplePdf(2, 90);
  const bBytes = await samplePdf(1);
  assert.equal((await inspectPdf(aBytes)).pageCount, 2);
  await assert.rejects(inspectPdf(new Uint8Array([1, 2, 3])), /Could not read/);
  assert.equal(normalizeQuarterTurn(-90), 270);
  assert.equal(normalizeQuarterTurn(450), 90);
  assert.deepEqual(moveItem(["a", "b", "c"], 1, -1), ["b", "a", "c"]);

  const original: PdfPagePlan[] = [
    { id: "a1", sourceId: "a", sourcePageIndex: 0, selected: true, rotation: 0 },
    { id: "a2", sourceId: "a", sourcePageIndex: 1, selected: true, rotation: 90 },
    { id: "b1", sourceId: "b", sourcePageIndex: 0, selected: false, rotation: 0 },
  ];
  const moved = movePdfSource(original, ["a", "b"], "b", -1);
  assert.deepEqual(moved.sourceOrder, ["b", "a"]);
  assert.deepEqual(moved.pages.map((page) => page.id), ["b1", "a1", "a2"]);

  const outputBytes = await buildPdf([
    { id: "a", name: "a.pdf", bytes: aBytes, pageCount: 2 },
    { id: "b", name: "b.pdf", bytes: bBytes, pageCount: 1 },
  ], moved.pages, true);
  const output = await PDFDocument.load(outputBytes);
  assert.equal(output.getPageCount(), 2);
  assert.equal(output.getPage(0).getWidth(), 300);
  assert.equal(output.getPage(0).getRotation().angle, 90);
  assert.equal(output.getPage(1).getWidth(), 301);
  assert.equal(output.getPage(1).getRotation().angle, 90);
  await assert.rejects(buildPdf([], [], true), /Select at least one page/);
});
