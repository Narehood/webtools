import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { assertImageDimensions, readImageDimensions } from "../src/lib/fileImageTools.ts";
import {
  DEFAULT_ADJUSTMENTS,
  PHOTO_QUALITY,
  analyzeColorCast,
  buildChannelCurves,
  collectDroppedFiles,
  comparePaths,
  correctPixels,
  correctedFileName,
  createPhotoZip,
  findBorder,
  identityAnalysis,
  looksLikeImage,
  neutralizeSample,
  photoOutputFormat,
  sampleSpot,
  withNeutralSpot,
  type ColorAdjustments,
  type DroppedEntry,
  type PixelImage,
} from "../src/lib/photoColor.ts";

const WIDTH = 60;
const HEIGHT = 40;
const NONE: ColorAdjustments = { strength: 0, warmth: 0, tint: 0, brightness: 0, contrast: 0, saturation: 0 };

function image(data: Uint8ClampedArray, width = WIDTH, height = HEIGHT): PixelImage {
  return { data, width, height };
}

/** Top half is a gray ramp; bottom half is equal red, green, and blue patches, so the true channel averages match. */
function scene(width = WIDTH, height = HEIGHT) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (y < height / 2) {
        const gray = Math.round(10 + (235 * x) / (width - 1));
        rgba.set([gray, gray, gray, 255], index);
      } else {
        const patch = Math.floor((x * 3) / width);
        rgba.set([patch === 0 ? 200 : 40, patch === 1 ? 200 : 40, patch === 2 ? 200 : 40, 255], index);
      }
    }
  }
  return rgba;
}

/** A faded drugstore print: lifted blacks and a crushed blue channel read as a strong yellow cast. */
function yellowed(rgba: Uint8ClampedArray) {
  const cast = new Uint8ClampedArray(rgba);
  for (let index = 0; index < cast.length; index += 4) {
    cast[index] = 30 + cast[index] * 0.85;
    cast[index + 1] = 25 + cast[index + 1] * 0.8;
    cast[index + 2] = 10 + cast[index + 2] * 0.35;
  }
  return cast;
}

/**
 * Surrounds a WIDTH by HEIGHT picture with a flat margin, like a film rebate or a scanner lid. The
 * picture's outermost pixels are blended half and half with the margin, as scanner smoothing and
 * JPEG compression do.
 */
function framed(content: Uint8ClampedArray, contentWidth: number, contentHeight: number, margin: number, color: readonly number[]) {
  const width = contentWidth + margin * 2;
  const height = contentHeight + margin * 2;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cx = x - margin;
      const cy = y - margin;
      const target = (y * width + x) * 4;
      if (cx < 0 || cy < 0 || cx >= contentWidth || cy >= contentHeight) {
        rgba.set([...color, 255], target);
        continue;
      }
      const from = (cy * contentWidth + cx) * 4;
      const edge = cx === 0 || cy === 0 || cx === contentWidth - 1 || cy === contentHeight - 1;
      rgba.set(edge ? [0, 1, 2].map((channel) => (content[from + channel] + color[channel]) / 2).concat(255) : content.subarray(from, from + 4), target);
    }
  }
  return image(rgba, width, height);
}

/** Worst channel spread across the gray ramp of a picture, optionally inside a margin and skipping an edge ring. */
function grayRampSpread(rgba: Uint8ClampedArray, width = WIDTH, height = HEIGHT, margin = 0, inset = 0) {
  const stride = width + margin * 2;
  let worst = 0;
  for (let y = margin + inset; y < margin + height / 2; y += 1) {
    for (let x = margin + inset; x < margin + width - inset; x += 1) {
      const index = (y * stride + x) * 4;
      const channels = [rgba[index], rgba[index + 1], rgba[index + 2]];
      worst = Math.max(worst, Math.max(...channels) - Math.min(...channels));
    }
  }
  return worst;
}

test("auto correction neutralizes a strong yellow cast", () => {
  const cast = yellowed(scene());
  assert.ok(grayRampSpread(cast) > 100, "fixture should start visibly yellow");

  const analysis = analyzeColorCast(image(cast));
  assert.equal(analysis.sampled, WIDTH * HEIGHT);
  assert.ok(analysis.high[2] < 110, `blue white point should sit low, got ${analysis.high[2]}`);
  const corrected = correctPixels(cast, analysis, DEFAULT_ADJUSTMENTS);
  assert.ok(grayRampSpread(corrected) <= 8, `grays should come back neutral, spread ${grayRampSpread(corrected)}`);

  const redPatch = ((HEIGHT - 2) * WIDTH + 2) * 4;
  assert.ok(corrected[redPatch] > corrected[redPatch + 1] + 100, "red stays red");
  const bluePatch = ((HEIGHT - 2) * WIDTH + WIDTH - 3) * 4;
  assert.ok(corrected[bluePatch + 2] > corrected[bluePatch] + 100, "blue is restored");
});

test("grass and sky do not tint the grays", () => {
  // Rows: sky, lawn, then a strip of pavement, a white wall, and a dark window.
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const color = y < 16 ? [90, 140, 210] : y < 34 ? [70, 140, 60] : x < 24 ? [128, 128, 128] : x < 48 ? [235, 235, 230] : [40, 40, 45];
      rgba.set([...color, 255], (y * WIDTH + x) * 4);
    }
  }
  const cast = yellowed(rgba);
  const corrected = correctPixels(cast, analyzeColorCast(image(cast)), DEFAULT_ADJUSTMENTS);
  const pavement = ((HEIGHT - 3) * WIDTH + 5) * 4;
  const channels = [corrected[pavement], corrected[pavement + 1], corrected[pavement + 2]];
  assert.ok(Math.max(...channels) - Math.min(...channels) <= 10, `pavement should stay gray, got ${channels}`);
  const lawn = (20 * WIDTH + 5) * 4;
  assert.ok(corrected[lawn + 1] > corrected[lawn] + 50 && corrected[lawn + 1] > corrected[lawn + 2] + 50, "lawn stays green");
});

test("film rebates and scanner lids do not pin the black and white points", () => {
  const [width, height, margin] = [240, 160, 40];
  const cast = yellowed(scene(width, height));
  const cropped = analyzeColorCast(image(cast, width, height));

  // The margins below cover more than half of each frame, and the blended edge is 2%; both are far past the 0.5% clip.
  for (const color of [[8, 8, 8], [246, 244, 240], [0, 0, 0]]) {
    const scan = framed(cast, width, height, margin, color);
    const analysis = analyzeColorCast(scan);
    // Only the margin and a thin ring at the photo's edge are skipped.
    assert.ok(analysis.sampled < width * height && analysis.sampled > width * height * 0.9, `margin ${color} kept ${analysis.sampled} pixels`);
    for (let channel = 0; channel < 3; channel += 1) {
      assert.ok(Math.abs(analysis.low[channel] - cropped.low[channel]) <= 8, `margin ${color} pinned black: ${analysis.low} vs ${cropped.low}`);
      assert.ok(Math.abs(analysis.high[channel] - cropped.high[channel]) <= 8, `margin ${color} pinned white: ${analysis.high} vs ${cropped.high}`);
    }
    const corrected = correctPixels(scan.data, analysis, DEFAULT_ADJUSTMENTS);
    const spread = grayRampSpread(corrected, width, height, margin, 1);
    assert.ok(spread <= 8, `grays inside a ${color} margin should be neutral, spread ${spread}`);
  }

  const lid = framed(cast, width, height, margin, [246, 244, 240]);
  const shadow = ((margin + 2) * lid.width + margin + 1) * 4;
  const corrected = correctPixels(lid.data, analyzeColorCast(lid), DEFAULT_ADJUSTMENTS);
  assert.ok(Math.max(corrected[shadow], corrected[shadow + 1], corrected[shadow + 2]) < 20, "shadows reach black inside a lid margin");
});

test("black and white subjects still set the levels", () => {
  // A neutral snapshot with a black coat and a white shirt inside the frame, and a dark bag touching a short stretch of the bottom edge.
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const coat = x >= 10 && x < 20 && y >= 8 && y < 28;
      const shirt = x >= 36 && x < 46 && y >= 8 && y < 28;
      const bag = x >= 25 && x < 40 && y >= 32;
      const color = coat || bag ? [10, 10, 10] : shirt ? [245, 245, 240] : [120 + (x % 7), 118, 112 + (y % 5)];
      rgba.set([...color, 255], (y * WIDTH + x) * 4);
    }
  }
  const subjects = image(rgba);
  assert.equal(findBorder(subjects).reduce((sum, value) => sum + value, 0), 0);
  const analysis = analyzeColorCast(subjects);
  assert.deepEqual(analysis.low, [10, 10, 10]);
  assert.deepEqual(analysis.high, [245, 245, 240]);
});

test("a bright sky along the top edge is part of the photo, not a margin", () => {
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      // Overcast sky brightening toward the horizon, with a little cloud texture, over a darker street.
      const sky = Math.min(252, 212 + y * 2.5 + ((x * 7 + y * 3) % 5));
      const color = y < 16 ? [sky, sky, sky - 2] : [90 + (x % 9), 85, 80];
      rgba.set([...color, 255], (y * WIDTH + x) * 4);
    }
  }
  assert.equal(findBorder(image(rgba)).reduce((sum, value) => sum + value, 0), 0);
  assert.equal(analyzeColorCast(image(rgba)).sampled, WIDTH * HEIGHT);
});

test("strength scales the automatic correction and zero leaves pixels untouched", () => {
  const cast = yellowed(scene());
  const analysis = analyzeColorCast(image(cast));
  assert.deepEqual(correctPixels(cast, analysis, NONE), cast);
  const half = grayRampSpread(correctPixels(cast, analysis, { ...NONE, strength: 50 }));
  assert.ok(half < grayRampSpread(cast) && half > grayRampSpread(correctPixels(cast, analysis, DEFAULT_ADJUSTMENTS)));
});

test("transparent pixels are skipped and an empty image is an identity", () => {
  const cast = yellowed(scene());
  for (let y = 0; y < HEIGHT; y += 1) cast[(y * WIDTH + WIDTH - 1) * 4 + 3] = 0;
  assert.equal(analyzeColorCast(image(cast)).sampled, (WIDTH - 1) * HEIGHT);
  assert.deepEqual(analyzeColorCast(image(new Uint8ClampedArray(8), 2, 1)), identityAnalysis());
});

test("a picked neutral spot becomes gray", () => {
  const cast = yellowed(scene());
  const analysis = analyzeColorCast(image(cast));
  const spot = { x: 40.5 / WIDTH, y: 5.5 / HEIGHT };
  const picked = withNeutralSpot(analysis, image(cast), spot);
  assert.deepEqual(picked.low, analysis.low);
  assert.equal(withNeutralSpot(analysis, image(cast), null), analysis);
  const corrected = correctPixels(cast, picked, DEFAULT_ADJUSTMENTS);
  const index = (5 * WIDTH + 40) * 4;
  const channels = [corrected[index], corrected[index + 1], corrected[index + 2]];
  assert.ok(Math.max(...channels) - Math.min(...channels) <= 3, `picked spot should be neutral, got ${channels}`);
  assert.throws(() => neutralizeSample(analysis, { r: 300, g: 0, b: 0 }), /0 to 255/);
});

test("a gray spot samples the same patch of a textured photo at any resolution", () => {
  // Full resolution is a pixel-level checkerboard of grain; the preview is its smoothed average.
  const full = 1600;
  const grain = new Uint8ClampedArray(full * full * 4);
  for (let y = 0; y < full; y += 1) {
    for (let x = 0; x < full; x += 1) grain.set((x + y) % 2 ? [200, 180, 90, 255] : [100, 90, 40, 255], (y * full + x) * 4);
  }
  const preview = new Uint8ClampedArray(400 * 400 * 4);
  for (let index = 0; index < preview.length; index += 4) preview.set([150, 135, 65, 255], index);
  const spot = { x: 0.3, y: 0.6 };
  const sharp = sampleSpot(image(grain, full, full), spot);
  const smooth = sampleSpot(image(preview, 400, 400), spot);
  for (const channel of ["r", "g", "b"] as const) assert.ok(Math.abs(sharp[channel] - smooth[channel]) <= 2, `${channel}: ${sharp[channel]} vs ${smooth[channel]}`);
});

test("manual sliders move color in the expected direction", () => {
  const gray = new Uint8ClampedArray([128, 128, 128, 255, 40, 40, 40, 255, 215, 215, 215, 255]);
  const identity = identityAnalysis();
  const warm = correctPixels(gray, identity, { ...NONE, warmth: 60 });
  assert.ok(warm[2] < 120 && warm[0] > 128 && warm[1] > 128, `warmth should add yellow, got ${warm.slice(0, 3)}`);
  const cool = correctPixels(gray, identity, { ...NONE, warmth: -60 });
  assert.ok(cool[2] > 136, "negative warmth adds blue");
  const magenta = correctPixels(gray, identity, { ...NONE, tint: 60 });
  assert.ok(magenta[1] < magenta[0] && magenta[1] < magenta[2], "positive tint removes green");
  const bright = correctPixels(gray, identity, { ...NONE, brightness: 50 });
  assert.ok(bright[0] > 140 && bright[0] === bright[1] && bright[1] === bright[2], "brightness keeps gray neutral");
  const punchy = correctPixels(gray, identity, { ...NONE, contrast: 80 });
  assert.ok(punchy[4] < 40 && punchy[8] > 215, "contrast darkens shadows and lifts highlights");
  const flat = correctPixels(gray, identity, { ...NONE, contrast: -80 });
  assert.ok(flat[4] > 40 && flat[8] < 215, "negative contrast flattens");

  const color = new Uint8ClampedArray([200, 80, 40, 255]);
  const mono = correctPixels(color, identity, { ...NONE, saturation: -100 });
  assert.ok(Math.abs(mono[0] - mono[1]) <= 1 && Math.abs(mono[1] - mono[2]) <= 1, "-100 saturation is grayscale");
  const vivid = correctPixels(color, identity, { ...NONE, saturation: 40 });
  assert.ok(vivid[0] > 200 && vivid[2] < 40, "saturation pushes channels apart");
  assert.equal(vivid[3], 255);
});

test("correction validates inputs and can run in place", () => {
  const pixels = yellowed(scene());
  const analysis = analyzeColorCast(image(pixels));
  const copy = correctPixels(pixels, analysis, DEFAULT_ADJUSTMENTS);
  assert.equal(correctPixels(pixels, analysis, DEFAULT_ADJUSTMENTS, pixels), pixels);
  assert.deepEqual(pixels, copy);
  assert.throws(() => buildChannelCurves(analysis, { ...DEFAULT_ADJUSTMENTS, warmth: 101 }), /warmth must be a number from -100 to 100/);
  assert.throws(() => buildChannelCurves(analysis, { ...DEFAULT_ADJUSTMENTS, strength: Number.NaN }), /strength/);
  assert.throws(() => correctPixels(new Uint8ClampedArray(6), analysis, DEFAULT_ADJUSTMENTS), /multiple of 4/);
  assert.throws(() => correctPixels(pixels, analysis, DEFAULT_ADJUSTMENTS, new Uint8ClampedArray(4)), /same length/);
  assert.throws(() => analyzeColorCast(image(pixels), { clip: 0.5 }), /clip/);
  assert.throws(() => analyzeColorCast(image(pixels, WIDTH, HEIGHT + 1)), /match the pixel data/);
});

test("spot samples average a neighborhood and skip transparency", () => {
  const rgba = new Uint8ClampedArray([
    10, 20, 30, 255, 30, 40, 50, 255, 0, 0, 0, 0,
    50, 60, 70, 255, 70, 80, 90, 255, 0, 0, 0, 0,
  ]);
  assert.deepEqual(sampleSpot(image(rgba, 3, 2), { x: 0, y: 0 }), { r: 40, g: 50, b: 60 });
  assert.deepEqual(sampleSpot(image(rgba, 3, 2), { x: 1, y: 1 }), { r: 50, g: 60, b: 70 }, "the far edge clamps to the last pixel");
  assert.throws(() => sampleSpot(image(new Uint8ClampedArray(16), 2, 2), { x: 0.5, y: 0.5 }), /transparent/);
  assert.throws(() => sampleSpot(image(rgba, 3, 2), { x: 1.2, y: 0 }), /0 to 1/);
});

test("matching the original format never quietly becomes a lossy JPEG", () => {
  const match = (type: string, name: string) => photoOutputFormat({ type, name }, "match");
  assert.deepEqual(match("image/jpeg", "scan.jpg"), { mime: "image/jpeg", ext: "jpg", quality: PHOTO_QUALITY });
  assert.equal(match("", "scan.PNG").ext, "png", "a blank type falls back to the extension");
  assert.equal(match("", "scan.jpeg").ext, "jpg");
  assert.equal(match("", "scan.webp").ext, "webp");
  assert.equal(match("", "scan.bmp").ext, "png");
  assert.equal(match("image/avif", "scan.avif").ext, "png", "AVIF cannot be re-encoded reliably, so it stays lossless");
  assert.equal(match("image/gif", "scan.gif").ext, "png");
  assert.equal(match("", "scan").ext, "png");
  assert.equal(photoOutputFormat({ type: "image/png", name: "scan.png" }, "jpeg").quality, PHOTO_QUALITY);
  assert.equal(correctedFileName("Scan 0042.JPG", "jpg"), "Scan-0042-corrected.jpg");
});

test("image headers reveal oversized files before decoding", () => {
  const bytes = (...parts: (string | number[])[]) => new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part)));
  const be32 = (value: number) => [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
  const le32 = (value: number) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];

  const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], "IHDR", be32(50_000), be32(40_000));
  assert.deepEqual(readImageDimensions(png), { width: 50_000, height: 40_000 });
  assert.throws(() => assertImageDimensions(50_000, 40_000), /too many pixels/);

  const app0 = [0xff, 0xe0, 0, 16, ...bytes("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const huffman = [0xff, 0xc4, 0, 4, 0, 0];
  const jpeg = bytes([0xff, 0xd8], app0, huffman, [0xff, 0xc2, 0, 17, 8, 0x0b, 0xb8, 0x0f, 0xa0, 3]);
  assert.deepEqual(readImageDimensions(jpeg), { width: 4000, height: 3000 });
  assert.equal(readImageDimensions(jpeg.subarray(0, 24)), null, "a header cut off before the frame is unknown");
  assert.equal(readImageDimensions(bytes([0xff, 0xd8], app0, [0xff, 0xda, 0, 2])), null);

  assert.deepEqual(readImageDimensions(bytes("GIF89a", [0x40, 1, 0xf0, 0])), { width: 320, height: 240 });
  assert.deepEqual(readImageDimensions(bytes("BM", le32(0), le32(0), le32(54), le32(40), le32(300), le32(-200))), { width: 300, height: 200 });

  const riff = (chunk: string, body: number[]) => bytes("RIFF", le32(0), "WEBP", chunk, le32(0), body);
  assert.deepEqual(readImageDimensions(riff("VP8X", [0, 0, 0, 0, ...le32(1919).slice(0, 3), ...le32(1079).slice(0, 3)])), { width: 1920, height: 1080 });
  const lossless = (639 | (479 << 14)) >>> 0;
  assert.deepEqual(readImageDimensions(riff("VP8L", [0x2f, ...le32(lossless)])), { width: 640, height: 480 });
  assert.deepEqual(readImageDimensions(riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, 0x00, 0x05, 0xd0, 0x02])), { width: 1280, height: 720 });

  assert.equal(readImageDimensions(bytes("II*\0")), null, "TIFF is left to the decoder");
  assert.equal(readImageDimensions(png.subarray(0, 20)), null);
});

function fakeFile(path: string): DroppedEntry {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return { isFile: true, isDirectory: false, fullPath: path, file: (success) => success(new File(["x"], name)) };
}

function fakeFolder(path: string, children: DroppedEntry[], batchSize = 2): DroppedEntry {
  return {
    isFile: false,
    isDirectory: true,
    fullPath: path,
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (success) => {
          success(children.slice(offset, offset + batchSize));
          offset += batchSize;
        },
      };
    },
  };
}

test("dropped folders are walked, filtered, and kept in roll order", async () => {
  const roll = fakeFolder("/Roll 3", [
    fakeFile("/Roll 3/Scan 10.jpg"),
    fakeFile("/Roll 3/Thumbs.db"),
    fakeFile("/Roll 3/Scan 2.jpg"),
    fakeFolder("/Roll 3/extras", [fakeFile("/Roll 3/extras/Scan 1.tif")]),
    fakeFile("/Roll 3/Scan 1.JPG"),
  ]);
  const files = await collectDroppedFiles([roll, fakeFile("/notes.txt")], 100);
  assert.deepEqual(files.map((file) => file.name), ["notes.txt", "Scan 1.tif", "Scan 1.JPG", "Scan 2.jpg", "Scan 10.jpg", "Thumbs.db"]);
  assert.deepEqual(files.filter(looksLikeImage).map((file) => file.name), ["Scan 1.tif", "Scan 1.JPG", "Scan 2.jpg", "Scan 10.jpg"]);
  assert.ok(comparePaths("Scan 2.jpg", "Scan 10.jpg") < 0);
  assert.equal((await collectDroppedFiles([roll], 2)).length, 2, "collection stops at the limit");
  assert.equal(looksLikeImage({ name: "IMG_0001.HEIC", type: "" }), true);
  assert.equal(looksLikeImage({ name: "notes.txt", type: "text/plain" }), false);
});

test("folder collection stops reading directory batches once the file limit is reached", async () => {
  let reads = 0;
  const folder: DroppedEntry = {
    isFile: false,
    isDirectory: true,
    fullPath: "/Roll",
    createReader: () => ({
      readEntries: (success) => {
        reads += 1;
        assert.equal(reads, 1, "later batches must not be read after reaching the limit");
        success([
          fakeFolder("/Roll/nested", [fakeFile("/Roll/nested/Scan 1.jpg"), fakeFile("/Roll/nested/Scan 2.jpg")]),
          { ...fakeFile("/Roll/Scan 3.jpg"), file: () => assert.fail("files after the limit must not be opened") },
        ]);
      },
    }),
  };
  assert.deepEqual((await collectDroppedFiles([folder], 2)).map((file) => file.name), ["Scan 1.jpg", "Scan 2.jpg"]);
  assert.equal(reads, 1);
});

test("a ZIP is built one photo at a time with unique names", async () => {
  const zip = await createPhotoZip();
  zip.add("roll-corrected.jpg", new Uint8Array([1, 2, 3]));
  zip.add("ROLL-corrected.jpg", new Uint8Array([4, 5]));
  zip.add("roll-corrected.jpg", new Uint8Array([6]));
  const archive = await zip.finish();
  assert.equal(archive.type, "application/zip");
  const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  assert.deepEqual(Object.keys(files), ["roll-corrected.jpg", "ROLL-corrected-2.jpg", "roll-corrected-3.jpg"]);
  assert.deepEqual([...files["ROLL-corrected-2.jpg"]], [4, 5]);
  await assert.rejects((await createPhotoZip()).finish(), /at least one photo/);
});
