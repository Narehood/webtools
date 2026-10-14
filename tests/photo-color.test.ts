import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import {
  DEFAULT_ADJUSTMENTS,
  analyzeColorCast,
  averageSample,
  buildChannelCurves,
  buildPhotoZip,
  correctPixels,
  correctedFileName,
  identityAnalysis,
  neutralizeSample,
  photoOutputFormat,
  uniqueFileNames,
  type ColorAdjustments,
} from "../src/lib/photoColor.ts";

const WIDTH = 60;
const HEIGHT = 40;
const NONE: ColorAdjustments = { strength: 0, warmth: 0, tint: 0, brightness: 0, contrast: 0, saturation: 0 };

/** Top half is a gray ramp; bottom half is equal red, green, and blue patches, so the true channel averages match. */
function scene() {
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = (y * WIDTH + x) * 4;
      if (y < HEIGHT / 2) {
        const gray = Math.round(10 + (235 * x) / (WIDTH - 1));
        rgba.set([gray, gray, gray, 255], index);
      } else {
        const patch = Math.floor((x * 3) / WIDTH);
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

function grayRampSpread(rgba: Uint8ClampedArray) {
  let worst = 0;
  for (let y = 0; y < HEIGHT / 2; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = (y * WIDTH + x) * 4;
      const channels = [rgba[index], rgba[index + 1], rgba[index + 2]];
      worst = Math.max(worst, Math.max(...channels) - Math.min(...channels));
    }
  }
  return worst;
}

test("auto correction neutralizes a strong yellow cast", () => {
  const cast = yellowed(scene());
  assert.ok(grayRampSpread(cast) > 100, "fixture should start visibly yellow");

  const analysis = analyzeColorCast(cast);
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
  const corrected = correctPixels(cast, analyzeColorCast(cast), DEFAULT_ADJUSTMENTS);
  const pavement = ((HEIGHT - 3) * WIDTH + 5) * 4;
  const channels = [corrected[pavement], corrected[pavement + 1], corrected[pavement + 2]];
  assert.ok(Math.max(...channels) - Math.min(...channels) <= 10, `pavement should stay gray, got ${channels}`);
  const lawn = (20 * WIDTH + 5) * 4;
  assert.ok(corrected[lawn + 1] > corrected[lawn] + 50 && corrected[lawn + 1] > corrected[lawn + 2] + 50, "lawn stays green");
});

test("strength scales the automatic correction and zero leaves pixels untouched", () => {
  const cast = yellowed(scene());
  const analysis = analyzeColorCast(cast);
  assert.deepEqual(correctPixels(cast, analysis, NONE), cast);
  const half = grayRampSpread(correctPixels(cast, analysis, { ...NONE, strength: 50 }));
  assert.ok(half < grayRampSpread(cast) && half > grayRampSpread(correctPixels(cast, analysis, DEFAULT_ADJUSTMENTS)));
});

test("analysis ignores pure black film borders and transparent pixels", () => {
  const content = yellowed(scene());
  const width = WIDTH + 20;
  const framed = new Uint8ClampedArray(width * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (x < 10) framed.set([0, 0, 0, 255], index);
      else if (x >= width - 10) framed.set([0, 0, 255, 0], index);
      else framed.set(content.subarray((y * WIDTH + x - 10) * 4, (y * WIDTH + x - 9) * 4), index);
    }
  }
  const analysis = analyzeColorCast(framed);
  assert.equal(analysis.sampled, WIDTH * HEIGHT);
  assert.ok(analysis.low[0] >= 30 && analysis.low[2] >= 10, `border should not anchor black, got ${analysis.low}`);
  assert.deepEqual(analyzeColorCast(new Uint8ClampedArray(8)), identityAnalysis());
});

test("a picked neutral spot becomes gray", () => {
  const cast = yellowed(scene());
  const analysis = analyzeColorCast(cast);
  const sample = averageSample(cast, WIDTH, HEIGHT, 40, 5, 0);
  const picked = neutralizeSample(analysis, sample);
  assert.deepEqual(picked.low, analysis.low);
  const corrected = correctPixels(cast, picked, DEFAULT_ADJUSTMENTS);
  const index = (5 * WIDTH + 40) * 4;
  const channels = [corrected[index], corrected[index + 1], corrected[index + 2]];
  assert.ok(Math.max(...channels) - Math.min(...channels) <= 3, `picked spot should be neutral, got ${channels}`);
  assert.throws(() => neutralizeSample(analysis, { r: 300, g: 0, b: 0 }), /0 to 255/);
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
  const analysis = analyzeColorCast(pixels);
  const copy = correctPixels(pixels, analysis, DEFAULT_ADJUSTMENTS);
  assert.equal(correctPixels(pixels, analysis, DEFAULT_ADJUSTMENTS, pixels), pixels);
  assert.deepEqual(pixels, copy);
  assert.throws(() => buildChannelCurves(analysis, { ...DEFAULT_ADJUSTMENTS, warmth: 101 }), /warmth must be a number from -100 to 100/);
  assert.throws(() => buildChannelCurves(analysis, { ...DEFAULT_ADJUSTMENTS, strength: Number.NaN }), /strength/);
  assert.throws(() => correctPixels(new Uint8ClampedArray(6), analysis, DEFAULT_ADJUSTMENTS), /multiple of 4/);
  assert.throws(() => correctPixels(pixels, analysis, DEFAULT_ADJUSTMENTS, new Uint8ClampedArray(4)), /same length/);
  assert.throws(() => analyzeColorCast(pixels, { clip: 0.5 }), /clip/);
});

test("neutral samples average a neighborhood and skip transparency", () => {
  const rgba = new Uint8ClampedArray([
    10, 20, 30, 255, 30, 40, 50, 255, 0, 0, 0, 0,
    50, 60, 70, 255, 70, 80, 90, 255, 0, 0, 0, 0,
  ]);
  assert.deepEqual(averageSample(rgba, 3, 2, 0, 0, 1), { r: 40, g: 50, b: 60 });
  assert.deepEqual(averageSample(rgba, 3, 2, -5, 9, 0), { r: 50, g: 60, b: 70 }, "positions clamp to the image");
  assert.throws(() => averageSample(rgba, 3, 2, 9, 0, 0), /transparent/);
  assert.throws(() => averageSample(rgba, 2, 2, 0, 0), /match the pixel data/);
});

test("output names and formats suit a batch download", async () => {
  assert.equal(photoOutputFormat("image/jpeg", "match").mime, "image/jpeg");
  assert.equal(photoOutputFormat("image/png", "match").ext, "png");
  assert.equal(photoOutputFormat("image/bmp", "match").ext, "png");
  assert.equal(photoOutputFormat("image/webp", "match").ext, "webp");
  assert.equal(photoOutputFormat("image/avif", "match").ext, "jpg");
  assert.equal(photoOutputFormat("image/png", "jpeg").ext, "jpg");
  assert.equal(correctedFileName("Scan 0042.JPG", "jpg"), "Scan-0042-corrected.jpg");
  assert.deepEqual(uniqueFileNames(["a.jpg", "A.jpg", "a.jpg", "b"]), ["a.jpg", "A-2.jpg", "a-3.jpg", "b"]);

  const zip = await buildPhotoZip([
    { name: "roll-corrected.jpg", data: new Uint8Array([1, 2, 3]) },
    { name: "roll-corrected.jpg", data: new Uint8Array([4, 5]) },
  ]);
  const files = unzipSync(zip);
  assert.deepEqual(Object.keys(files), ["roll-corrected.jpg", "roll-corrected-2.jpg"]);
  assert.deepEqual([...files["roll-corrected-2.jpg"]], [4, 5]);
  await assert.rejects(buildPhotoZip([]), /at least one photo/);
});
