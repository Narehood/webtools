import { fileStem } from "./fileImageTools.ts";

export type RgbColor = { r: number; g: number; b: number };

export type ChannelValues = [red: number, green: number, blue: number];

export type ColorAnalysis = {
  /** Input level, per channel, that becomes black. */
  low: ChannelValues;
  /** Input level, per channel, that becomes white. */
  high: ChannelValues;
  /** Midtone exponent, per channel, that turns the photo's near-neutral areas gray. */
  gamma: ChannelValues;
  /** Pixels that informed the levels. Zero means the analysis is an identity. */
  sampled: number;
};

export type ColorAnalysisOptions = {
  /** Fraction of pixels allowed to clip at each end of every channel. */
  clip?: number;
};

export type ColorAdjustments = {
  /** 0 to 100. How much of the automatic correction to apply. */
  strength: number;
  /** -100 to 100. Negative cools toward blue; positive warms toward yellow. */
  warmth: number;
  /** -100 to 100. Negative shifts toward green; positive toward magenta. */
  tint: number;
  /** -100 to 100. Moves midtones; black and white stay put. */
  brightness: number;
  /** -100 to 100. */
  contrast: number;
  /** -100 to 100. -100 is grayscale. */
  saturation: number;
};

export const ADJUSTMENT_RANGES: Record<keyof ColorAdjustments, readonly [number, number]> = {
  strength: [0, 100],
  warmth: [-100, 100],
  tint: [-100, 100],
  brightness: [-100, 100],
  contrast: [-100, 100],
  saturation: [-100, 100],
};

export const DEFAULT_ADJUSTMENTS: ColorAdjustments = {
  strength: 100,
  warmth: 0,
  tint: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

export type PhotoOutputChoice = "match" | "jpeg" | "png" | "webp";

export type PhotoOutputFormat = { mime: string; ext: string; quality: number };

const DEFAULT_CLIP = 0.005;
const MIN_ALPHA = 128;
// A channel squeezed into fewer levels than this is widened instead of stretched, so noise is not amplified wildly.
const MIN_SPAN = 32;
const MIN_GAMMA = 0.4;
const MAX_GAMMA = 2.5;
// Pixels whose stretched channels differ by less than this count toward the midtone balance.
const NEUTRAL_CHROMA = 0.25;
// Below this share of near-neutral pixels, the midtones are left alone rather than guessed.
const MIN_NEUTRAL_SHARE = 0.01;
const NEUTRAL_PASSES = 4;
// Exponent swing at the slider ends, in stops (powers of two).
const COLOR_SHIFT_STOPS = 0.6;
const BRIGHTNESS_STOPS = 0.6;

type RgbaPixels = Uint8ClampedArray | Uint8Array;

function assertRgba(rgba: RgbaPixels) {
  if (!(rgba instanceof Uint8ClampedArray || rgba instanceof Uint8Array)) {
    throw new Error("RGBA pixel data must be a Uint8ClampedArray or Uint8Array");
  }
  if (rgba.length === 0 || rgba.length % 4 !== 0) {
    throw new Error(`RGBA pixel data length must be a positive multiple of 4; received ${rgba.length}`);
  }
}

function assertAdjustments(adjustments: ColorAdjustments) {
  for (const key of Object.keys(ADJUSTMENT_RANGES) as (keyof ColorAdjustments)[]) {
    const [minimum, maximum] = ADJUSTMENT_RANGES[key];
    const value = adjustments?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
      throw new Error(`${key} must be a number from ${minimum} to ${maximum}`);
    }
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function stretch(value: number, low: number, high: number) {
  return clamp((value - low) / (high - low), 0, 1);
}

/** Film borders and blown highlights are already neutral and would anchor every channel at 0 or 255. */
function isFlatExtreme(red: number, green: number, blue: number) {
  return (red <= 3 && green <= 3 && blue <= 3) || (red >= 252 && green >= 252 && blue >= 252);
}

function lowLevel(histogram: Float64Array, cut: number) {
  let total = 0;
  for (let value = 0; value < 256; value += 1) {
    total += histogram[value];
    if (total > cut) return value;
  }
  return 0;
}

function highLevel(histogram: Float64Array, cut: number) {
  let total = 0;
  for (let value = 255; value >= 0; value -= 1) {
    total += histogram[value];
    if (total > cut) return value;
  }
  return 255;
}

function widen(low: number, high: number): [number, number] {
  if (high - low >= MIN_SPAN) return [low, high];
  const nextLow = clamp(Math.round((low + high) / 2 - MIN_SPAN / 2), 0, 255 - MIN_SPAN);
  return [nextLow, nextLow + MIN_SPAN];
}

function stretchedMean(histogram: Float64Array, count: number, low: number, high: number, gamma: number) {
  let total = 0;
  for (let value = 0; value < 256; value += 1) {
    if (histogram[value] > 0) total += histogram[value] * stretch(value, low, high) ** gamma;
  }
  return total / count;
}

/** Bisects for the exponent that moves a channel's stretched mean onto the target. Mean falls as gamma rises. */
function solveGamma(histogram: Float64Array, count: number, low: number, high: number, target: number) {
  const mean = stretchedMean(histogram, count, low, high, 1);
  if (mean <= 0.001 || mean >= 0.999 || target <= 0.001 || target >= 0.999) return 1;
  let lower = Math.log(MIN_GAMMA);
  let upper = Math.log(MAX_GAMMA);
  for (let step = 0; step < 40; step += 1) {
    const middle = (lower + upper) / 2;
    if (stretchedMean(histogram, count, low, high, Math.exp(middle)) > target) lower = middle;
    else upper = middle;
  }
  return Math.exp((lower + upper) / 2);
}

/**
 * Balances midtones from the areas that are already close to gray after stretching: walls,
 * pavement, clouds, white shirts. Averaging the whole frame instead would tint grays whenever grass
 * or sky dominates the shot. Each pass re-selects neutral pixels using the previous pass's balance.
 */
function neutralGamma(rgba: RgbaPixels, count: number, low: ChannelValues, high: ChannelValues): ChannelValues {
  let gamma: ChannelValues = [1, 1, 1];
  const curves = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
  for (let pass = 0; pass < NEUTRAL_PASSES; pass += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      for (let value = 0; value < 256; value += 1) curves[channel][value] = stretch(value, low[channel], high[channel]) ** gamma[channel];
    }
    const weighted = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
    let total = 0;
    for (let index = 0; index < rgba.length; index += 4) {
      if (rgba[index + 3] < MIN_ALPHA) continue;
      const red = rgba[index];
      const green = rgba[index + 1];
      const blue = rgba[index + 2];
      if (isFlatExtreme(red, green, blue)) continue;
      const r = curves[0][red];
      const g = curves[1][green];
      const b = curves[2][blue];
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const lightness = (r + g + b) / 3;
      if (chroma >= NEUTRAL_CHROMA || lightness < 0.05 || lightness > 0.97) continue;
      const weight = (1 - chroma / NEUTRAL_CHROMA) ** 2;
      weighted[0][red] += weight;
      weighted[1][green] += weight;
      weighted[2][blue] += weight;
      total += weight;
    }
    if (total < count * MIN_NEUTRAL_SHARE) return gamma;
    const means = weighted.map((histogram, channel) => stretchedMean(histogram, total, low[channel], high[channel], 1));
    const target = (means[0] + means[1] + means[2]) / 3;
    gamma = weighted.map((histogram, channel) => solveGamma(histogram, total, low[channel], high[channel], target)) as ChannelValues;
  }
  return gamma;
}

export function identityAnalysis(): ColorAnalysis {
  return { low: [0, 0, 0], high: [255, 255, 255], gamma: [1, 1, 1], sampled: 0 };
}

/**
 * Measures a color cast the way a darkroom "auto color" pass does: every channel is stretched
 * between its own clipped black and white points, then a per-channel midtone exponent turns
 * near-neutral areas gray. A yellowed print, which is short on blue, gets its blue channel
 * stretched and lifted until whites and grays line up again.
 */
export function analyzeColorCast(rgba: RgbaPixels, options: ColorAnalysisOptions = {}): ColorAnalysis {
  assertRgba(rgba);
  const clip = options.clip ?? DEFAULT_CLIP;
  if (typeof clip !== "number" || !Number.isFinite(clip) || clip < 0 || clip >= 0.25) {
    throw new Error("clip must be a number from 0 up to 0.25");
  }

  const histograms = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
  let count = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    if (rgba[index + 3] < MIN_ALPHA) continue;
    const red = rgba[index];
    const green = rgba[index + 1];
    const blue = rgba[index + 2];
    if (isFlatExtreme(red, green, blue)) continue;
    histograms[0][red] += 1;
    histograms[1][green] += 1;
    histograms[2][blue] += 1;
    count += 1;
  }
  if (count === 0) return identityAnalysis();

  const cut = clip * count;
  const low = [0, 0, 0] as ChannelValues;
  const high = [255, 255, 255] as ChannelValues;
  for (let channel = 0; channel < 3; channel += 1) {
    [low[channel], high[channel]] = widen(lowLevel(histograms[channel], cut), highLevel(histograms[channel], cut));
  }

  return { low, high, gamma: neutralGamma(rgba, count, low, high), sampled: count };
}

/**
 * Replaces the automatic midtone balance with one taken from a spot that should be gray or white.
 * Levels are kept, so the photo's black and white points still come from the analysis.
 */
export function neutralizeSample(analysis: ColorAnalysis, sample: RgbColor): ColorAnalysis {
  const values = [sample.r, sample.g, sample.b];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) {
    throw new Error("Neutral sample channels must be from 0 to 255");
  }
  // Keep away from 0 and 1, where no exponent can move a channel.
  const stretched = values.map((value, channel) =>
    clamp(stretch(value, analysis.low[channel], analysis.high[channel]), 0.02, 0.98),
  );
  const target = (stretched[0] + stretched[1] + stretched[2]) / 3;
  const gamma = stretched.map((value) => clamp(Math.log(target) / Math.log(value), MIN_GAMMA, MAX_GAMMA)) as ChannelValues;
  return { ...analysis, gamma };
}

function contrastCurve(value: number, amount: number) {
  if (amount >= 0) {
    const eased = value * value * (3 - 2 * value);
    return value + (eased - value) * amount;
  }
  return 0.5 + (value - 0.5) * (1 + amount * 0.5);
}

/** One 256-entry lookup table per channel, covering everything except saturation. */
export function buildChannelCurves(analysis: ColorAnalysis, adjustments: ColorAdjustments): [Uint8Array, Uint8Array, Uint8Array] {
  assertAdjustments(adjustments);
  const amount = adjustments.strength / 100;
  const warmth = adjustments.warmth / 100;
  const tint = adjustments.tint / 100;
  const contrast = adjustments.contrast / 100;
  const brightness = 2 ** (-(adjustments.brightness / 100) * BRIGHTNESS_STOPS);
  // Warmth trades blue against red and green; tint trades green against red and blue. Each sums to zero so gray stays gray in brightness.
  const shift = [
    2 ** (COLOR_SHIFT_STOPS * (-warmth / 2 - tint / 2)),
    2 ** (COLOR_SHIFT_STOPS * (-warmth / 2 + tint)),
    2 ** (COLOR_SHIFT_STOPS * (warmth - tint / 2)),
  ];

  return [0, 1, 2].map((channel) => {
    const low = analysis.low[channel] * amount;
    const high = 255 + (analysis.high[channel] - 255) * amount;
    const exponent = analysis.gamma[channel] ** amount * brightness * shift[channel];
    const curve = new Uint8Array(256);
    for (let value = 0; value < 256; value += 1) {
      const toned = contrastCurve(stretch(value, low, high) ** exponent, contrast);
      curve[value] = Math.round(clamp(toned, 0, 1) * 255);
    }
    return curve;
  }) as [Uint8Array, Uint8Array, Uint8Array];
}

/**
 * Applies the analysis and adjustments to RGBA pixels. Alpha is copied untouched.
 * `target` may be the same array as `source` to correct in place.
 */
export function correctPixels(
  source: RgbaPixels,
  analysis: ColorAnalysis,
  adjustments: ColorAdjustments,
  target: Uint8ClampedArray = new Uint8ClampedArray(source.length),
) {
  assertRgba(source);
  if (!(target instanceof Uint8ClampedArray) || target.length !== source.length) {
    throw new Error("Target pixels must be a Uint8ClampedArray the same length as the source");
  }
  const [red, green, blue] = buildChannelCurves(analysis, adjustments);
  const saturation = 1 + adjustments.saturation / 100;
  for (let index = 0; index < source.length; index += 4) {
    const r = red[source[index]];
    const g = green[source[index + 1]];
    const b = blue[source[index + 2]];
    if (saturation === 1) {
      target[index] = r;
      target[index + 1] = g;
      target[index + 2] = b;
    } else {
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      target[index] = luma + (r - luma) * saturation;
      target[index + 1] = luma + (g - luma) * saturation;
      target[index + 2] = luma + (b - luma) * saturation;
    }
    target[index + 3] = source[index + 3];
  }
  return target;
}

/** Averages visible pixels in a square around one point, so a single noisy grain does not set the balance. */
export function averageSample(rgba: RgbaPixels, width: number, height: number, x: number, y: number, radius = 3): RgbColor {
  assertRgba(rgba);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height * 4 !== rgba.length) {
    throw new Error("Width and height must match the pixel data");
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isSafeInteger(radius) || radius < 0) {
    throw new Error("Sample position and radius must be valid numbers");
  }
  const centerX = clamp(Math.round(x), 0, width - 1);
  const centerY = clamp(Math.round(y), 0, height - 1);
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let row = Math.max(0, centerY - radius); row <= Math.min(height - 1, centerY + radius); row += 1) {
    for (let column = Math.max(0, centerX - radius); column <= Math.min(width - 1, centerX + radius); column += 1) {
      const index = (row * width + column) * 4;
      if (rgba[index + 3] < MIN_ALPHA) continue;
      red += rgba[index];
      green += rgba[index + 1];
      blue += rgba[index + 2];
      count += 1;
    }
  }
  if (count === 0) throw new Error("That spot is transparent. Pick a visible part of the photo.");
  return { r: Math.round(red / count), g: Math.round(green / count), b: Math.round(blue / count) };
}

export function photoOutputFormat(sourceType: string, choice: PhotoOutputChoice): PhotoOutputFormat {
  const jpeg = { mime: "image/jpeg", ext: "jpg", quality: 0.92 };
  const png = { mime: "image/png", ext: "png", quality: 1 };
  const webp = { mime: "image/webp", ext: "webp", quality: 0.92 };
  if (choice === "jpeg") return jpeg;
  if (choice === "png") return png;
  if (choice === "webp") return webp;
  if (choice !== "match") throw new Error("Choose match, jpeg, png, or webp");
  const type = sourceType.toLowerCase();
  // Lossless sources stay lossless; anything the canvas cannot reliably re-encode becomes JPEG.
  if (type === "image/png" || type === "image/bmp" || type === "image/gif") return png;
  if (type === "image/webp") return webp;
  return jpeg;
}

export function correctedFileName(sourceName: string, ext: string) {
  return `${fileStem(sourceName, "photo")}-corrected.${ext}`;
}

export function uniqueFileNames(names: readonly string[]) {
  const used = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    for (let copy = 2; used.has(candidate.toLowerCase()); copy += 1) candidate = `${stem}-${copy}${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/** Stores already-compressed images without recompressing them. Duplicate names get a numeric suffix. */
export async function buildPhotoZip(entries: readonly { name: string; data: Uint8Array }[]) {
  if (entries.length === 0) throw new Error("Add at least one photo to download");
  const { zipSync } = await import("fflate");
  const names = uniqueFileNames(entries.map((entry) => entry.name));
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  entries.forEach((entry, index) => { files[names[index]] = [entry.data, { level: 0 }]; });
  return zipSync(files);
}
