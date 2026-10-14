import { fileStem } from "./fileImageTools.ts";

export type RgbColor = { r: number; g: number; b: number };

export type ChannelValues = [red: number, green: number, blue: number];

/** RGBA pixels with their size. ImageData fits. */
export type PixelImage = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };

/** A spot that should be gray, as a fraction of the width and height, so it can be re-sampled at any resolution. */
export type NeutralSpot = { x: number; y: number };

export type ColorAnalysis = {
  /** Input level, per channel, that becomes black. */
  low: ChannelValues;
  /** Input level, per channel, that becomes white. */
  high: ChannelValues;
  /** Midtone exponent, per channel, that turns the photo's near-neutral areas gray. */
  gamma: ChannelValues;
  /** Pixels that informed the levels, after borders and transparency. Zero means the analysis is an identity. */
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

/** Quality for JPEG and WebP output. High, because these are archival copies of family photos. */
export const PHOTO_QUALITY = 0.95;

/** A dropped file or folder. Matches the browser's FileSystemEntry, and is easy to fake in tests. */
export type DroppedEntry = {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly fullPath: string;
  file?(success: (file: File) => void, failure?: (error: DOMException) => void): void;
  createReader?(): { readEntries(success: (entries: DroppedEntry[]) => void, failure?: (error: DOMException) => void): void };
};

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
// Film rebates and scanner lids are nearly colorless and near black or white. Even a dark yellowed shadow, such as 38,33,14, carries more color than this.
const BORDER_CHROMA = 16;
const BORDER_DARK = 48;
const BORDER_LIGHT = 208;
// Neighboring border pixels differ by at most this much per channel, which follows a flat margin without leaking into the photo.
const BORDER_STEP = 16;
// A margin is flat. A bright sky or dark foreground along an edge varies more than this (standard deviation of brightness).
const BORDER_MAX_DEVIATION = 8;
// A margin runs along at least this share of one side; a dark coat or white shirt touching the edge usually does not.
const BORDER_MIN_SIDE_SHARE = 0.5;
// Where a margin meets the photo, scanner smoothing and JPEG chroma blocks blend the two. That ring, as a share of the longer side, is skipped too.
const BORDER_BLEND_SHARE = 0.01;
// Radius of a gray-spot sample as a share of the longer side, so the same patch of the photo is averaged at every resolution.
const SPOT_RADIUS_SHARE = 1 / 400;
const IMAGE_NAME = /\.(?:png|jpe?g|jfif|webp|gif|bmp|avif|tiff?|heic|heif)$/i;
const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
};
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

function assertPixelImage(image: PixelImage) {
  assertRgba(image?.data);
  const { width, height } = image;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height * 4 !== image.data.length) {
    throw new Error("Width and height must match the pixel data");
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

function isBorderTone(data: RgbaPixels, index: number) {
  const highest = Math.max(data[index], data[index + 1], data[index + 2]);
  const lowest = Math.min(data[index], data[index + 1], data[index + 2]);
  return data[index + 3] >= MIN_ALPHA && highest - lowest <= BORDER_CHROMA && (highest <= BORDER_DARK || lowest >= BORDER_LIGHT);
}

function isCloseTone(data: RgbaPixels, a: number, b: number) {
  return Math.abs(data[a] - data[b]) <= BORDER_STEP
    && Math.abs(data[a + 1] - data[b + 1]) <= BORDER_STEP
    && Math.abs(data[a + 2] - data[b + 2]) <= BORDER_STEP;
}

/**
 * Marks film rebates and scanner-lid margins: flat, near-black or near-white, nearly colorless regions
 * that touch the frame edge and run along at least half of one side, plus the thin blended ring where
 * a margin meets the photo. Their tone says nothing about the photo's cast, and because they can cover
 * a third of a scan, the clip cannot step past them. A black coat or white shirt inside the frame, or
 * touching only a short stretch of the edge, is kept.
 */
export function findBorder(image: PixelImage): Uint8Array {
  assertPixelImage(image);
  const { data, width, height } = image;
  const border = new Uint8Array(width * height);
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);

  const flood = (seed: number) => {
    if (seen[seed] || !isBorderTone(data, seed * 4)) return;
    seen[seed] = 1;
    queue[0] = seed;
    let head = 0;
    let tail = 1;
    let top = 0;
    let bottom = 0;
    let left = 0;
    let right = 0;
    let toneSum = 0;
    let toneSquares = 0;
    while (head < tail) {
      const pixel = queue[head];
      head += 1;
      const tone = (data[pixel * 4] + data[pixel * 4 + 1] + data[pixel * 4 + 2]) / 3;
      toneSum += tone;
      toneSquares += tone * tone;
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (y === 0) top += 1;
      if (y === height - 1) bottom += 1;
      if (x === 0) left += 1;
      if (x === width - 1) right += 1;
      const neighbors = [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, y > 0 ? pixel - width : -1, y < height - 1 ? pixel + width : -1];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || !isBorderTone(data, next * 4) || !isCloseTone(data, pixel * 4, next * 4)) continue;
        seen[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
    const runsAlongSide = Math.max(top, bottom) >= width * BORDER_MIN_SIDE_SHARE || Math.max(left, right) >= height * BORDER_MIN_SIDE_SHARE;
    const mean = toneSum / tail;
    const flat = Math.sqrt(Math.max(0, toneSquares / tail - mean * mean)) <= BORDER_MAX_DEVIATION;
    if (runsAlongSide && flat) for (let index = 0; index < tail; index += 1) border[queue[index]] = 1;
  };

  for (let x = 0; x < width; x += 1) {
    flood(x);
    flood((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    flood(y * width);
    flood(y * width + width - 1);
  }
  return blendRing(border, width, height);
}

/** Grows a border mask outward by the blend ring, breadth first, so each pixel is visited once. */
function blendRing(border: Uint8Array, width: number, height: number) {
  const reach = Math.max(2, Math.round(Math.max(width, height) * BORDER_BLEND_SHARE));
  const distance = new Uint16Array(width * height);
  const queue = new Int32Array(width * height);
  let tail = 0;
  for (let pixel = 0; pixel < border.length; pixel += 1) {
    if (border[pixel]) {
      queue[tail] = pixel;
      tail += 1;
    }
  }
  for (let head = 0; head < tail; head += 1) {
    const pixel = queue[head];
    if (distance[pixel] >= reach) continue;
    const x = pixel % width;
    const neighbors = [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, pixel >= width ? pixel - width : -1, pixel + width < border.length ? pixel + width : -1];
    for (const next of neighbors) {
      if (next < 0 || border[next]) continue;
      border[next] = 1;
      distance[next] = distance[pixel] + 1;
      queue[tail] = next;
      tail += 1;
    }
  }
  return border;
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
function neutralGamma(rgba: RgbaPixels, border: Uint8Array, count: number, low: ChannelValues, high: ChannelValues): ChannelValues {
  let gamma: ChannelValues = [1, 1, 1];
  const curves = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
  for (let pass = 0; pass < NEUTRAL_PASSES; pass += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      for (let value = 0; value < 256; value += 1) curves[channel][value] = stretch(value, low[channel], high[channel]) ** gamma[channel];
    }
    const weighted = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
    let total = 0;
    for (let pixel = 0, index = 0; index < rgba.length; pixel += 1, index += 4) {
      if (rgba[index + 3] < MIN_ALPHA || border[pixel]) continue;
      const red = rgba[index];
      const green = rgba[index + 1];
      const blue = rgba[index + 2];
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
 *
 * Pass original pixels, or an unsmoothed (nearest-neighbor) sample of them. A smoothed resample
 * averages grain away, and its clip points would not match the full-resolution file.
 */
export function analyzeColorCast(image: PixelImage, options: ColorAnalysisOptions = {}): ColorAnalysis {
  assertPixelImage(image);
  const clip = options.clip ?? DEFAULT_CLIP;
  if (typeof clip !== "number" || !Number.isFinite(clip) || clip < 0 || clip >= 0.25) {
    throw new Error("clip must be a number from 0 up to 0.25");
  }

  const rgba = image.data;
  const border = findBorder(image);
  const histograms = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
  let count = 0;
  for (let pixel = 0, index = 0; index < rgba.length; pixel += 1, index += 4) {
    if (rgba[index + 3] < MIN_ALPHA || border[pixel]) continue;
    histograms[0][rgba[index]] += 1;
    histograms[1][rgba[index + 1]] += 1;
    histograms[2][rgba[index + 2]] += 1;
    count += 1;
  }
  if (count === 0) return identityAnalysis();

  const cut = clip * count;
  const low = [0, 0, 0] as ChannelValues;
  const high = [255, 255, 255] as ChannelValues;
  for (let channel = 0; channel < 3; channel += 1) {
    [low[channel], high[channel]] = widen(lowLevel(histograms[channel], cut), highLevel(histograms[channel], cut));
  }

  return { low, high, gamma: neutralGamma(rgba, border, count, low, high), sampled: count };
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

/**
 * Averages the visible pixels around a spot, so a single grain does not set the balance. The patch
 * covers the same share of the photo at every resolution, so the preview and the saved file see the
 * same area.
 */
export function sampleSpot(image: PixelImage, spot: NeutralSpot): RgbColor {
  assertPixelImage(image);
  if (!spot || ![spot.x, spot.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error("Spot position must be from 0 to 1");
  }
  const { data: rgba, width, height } = image;
  const radius = Math.max(1, Math.round(Math.max(width, height) * SPOT_RADIUS_SHARE));
  const centerX = clamp(Math.floor(spot.x * width), 0, width - 1);
  const centerY = clamp(Math.floor(spot.y * height), 0, height - 1);
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

/** The analysis to use for one raster: its own gray-spot sample replaces the automatic midtone balance. */
export function withNeutralSpot(analysis: ColorAnalysis, image: PixelImage, spot: NeutralSpot | null) {
  return spot ? neutralizeSample(analysis, sampleSpot(image, spot)) : analysis;
}

function sourceType(source: { type: string; name: string }) {
  const type = source.type.toLowerCase();
  if (type) return type;
  const extension = /\.([a-z0-9]+)$/i.exec(source.name)?.[1].toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? "";
}

export function photoOutputFormat(source: { type: string; name: string }, choice: PhotoOutputChoice): PhotoOutputFormat {
  const jpeg = { mime: "image/jpeg", ext: "jpg", quality: PHOTO_QUALITY };
  const png = { mime: "image/png", ext: "png", quality: 1 };
  const webp = { mime: "image/webp", ext: "webp", quality: PHOTO_QUALITY };
  if (choice === "jpeg") return jpeg;
  if (choice === "png") return png;
  if (choice === "webp") return webp;
  if (choice !== "match") throw new Error("Choose match, jpeg, png, or webp");
  const type = sourceType(source);
  if (type === "image/jpeg") return jpeg;
  if (type === "image/webp") return webp;
  // PNG stays lossless. BMP and GIF have no canvas encoder and AVIF encoding is unreliable, so they become lossless PNG rather than a lossy JPEG.
  return png;
}

/** Whether a dropped file is worth trying as a photo. Unsupported image formats such as TIFF still pass, so the user hears why they were skipped. */
export function looksLikeImage(file: { name: string; type: string }) {
  return file.type.toLowerCase().startsWith("image/") || IMAGE_NAME.test(file.name);
}

/** Orders paths the way a person numbers a roll: "Scan 2" before "Scan 10". */
export function comparePaths(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function readEntryFile(entry: DroppedEntry) {
  return new Promise<File>((resolve, reject) => {
    if (entry.file) entry.file(resolve, reject);
    else reject(new Error(`Could not read ${entry.fullPath}`));
  });
}

/** Walks dropped files and folders, including subfolders, and returns up to `limit` files sorted by path. */
export async function collectDroppedFiles(entries: readonly DroppedEntry[], limit: number) {
  const found: { path: string; file: File }[] = [];
  const pending = [...entries];
  while (pending.length > 0 && found.length < limit) {
    const entry = pending.shift() as DroppedEntry;
    if (entry.isFile) {
      found.push({ path: entry.fullPath, file: await readEntryFile(entry) });
    } else if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      // Browsers return a folder in batches; an empty batch means the end.
      for (;;) {
        const batch = await new Promise<DroppedEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        pending.push(...batch);
      }
    }
  }
  return found.sort((a, b) => comparePaths(a.path, b.path)).map((entry) => entry.file);
}

export function correctedFileName(sourceName: string, ext: string) {
  return `${fileStem(sourceName, "photo")}-corrected.${ext}`;
}

/** Claims a case-insensitively unique name, adding -2, -3, and so on before the extension. */
function claimName(name: string, used: Set<string>) {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
  for (let copy = 2; used.has(candidate.toLowerCase()); copy += 1) candidate = `${stem}-${copy}${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export type PhotoZip = { add(name: string, data: Uint8Array): void; finish(): Promise<Blob> };

/**
 * Builds a ZIP one photo at a time, storing images without recompressing them. Each entry is copied
 * into a Blob as it is written, so the caller can drop its buffer before rendering the next photo
 * and the browser can page the archive out of memory.
 */
export async function createPhotoZip(): Promise<PhotoZip> {
  const { Zip, ZipPassThrough } = await import("fflate");
  const parts: Blob[] = [];
  const used = new Set<string>();
  let failure: Error | null = null;
  let settle: { resolve: (archive: Blob) => void; reject: (error: Error) => void } | null = null;
  const done = new Promise<Blob>((resolve, reject) => { settle = { resolve, reject }; });
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      failure = error;
      settle?.reject(error);
      return;
    }
    // fflate hands out views of plain ArrayBuffers; the Blob keeps its own copy.
    parts.push(new Blob([chunk as Uint8Array<ArrayBuffer>]));
    if (final) settle?.resolve(new Blob(parts, { type: "application/zip" }));
  });
  return {
    add(name, data) {
      if (failure) throw failure;
      const entry = new ZipPassThrough(claimName(name, used));
      zip.add(entry);
      entry.push(data, true);
    },
    finish() {
      if (used.size === 0) return Promise.reject(new Error("Add at least one photo to download"));
      zip.end();
      return done;
    },
  };
}
