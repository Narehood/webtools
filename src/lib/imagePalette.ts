export type RgbColor = { r: number; g: number; b: number };

export type PaletteColor = {
  rgb: RgbColor;
  hex: string;
  /** Number of sampled, visible pixels represented by this color. */
  count: number;
  /** Fraction of sampled, visible pixels represented by this color. */
  share: number;
};

export type ImagePaletteOptions = {
  /** Requested number of colors. Fewer may be returned for low-color images. */
  colorCount?: number;
  /** Maximum number of visible pixels used by the quantizer. */
  maxSamples?: number;
  /** Pixels with a lower alpha channel are ignored. */
  minAlpha?: number;
};

const DEFAULT_COLOR_COUNT = 6;
const MAX_COLOR_COUNT = 24;
const DEFAULT_MAX_SAMPLES = 20_000;
const MAX_SAMPLE_LIMIT = 100_000;
const DEFAULT_MIN_ALPHA = 16;

type WeightedColor = RgbColor & { count: number };

type ColorBox = {
  colors: WeightedColor[];
  count: number;
  redRange: number;
  greenRange: number;
  blueRange: number;
};

function assertByte(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${label} must be an integer from 0 to 255`);
  }
}

function assertIntegerInRange(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
}

export function rgbToHex(color: RgbColor) {
  if (!color || typeof color !== "object") {
    throw new Error("RGB color must include red, green, and blue channels");
  }
  assertByte(color.r, "Red channel");
  assertByte(color.g, "Green channel");
  assertByte(color.b, "Blue channel");
  return `#${[color.r, color.g, color.b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function contrastTextColor(color: RgbColor): "#000000" | "#ffffff" {
  // Validate through the public converter so both helpers accept the same RGB range.
  rgbToHex(color);
  const channels = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  return contrastWithBlack >= contrastWithWhite ? "#000000" : "#ffffff";
}

export function hexToRgb(value: string): RgbColor {
  if (typeof value !== "string") {
    throw new Error("Hex color must be a string in #RGB or #RRGGBB format");
  }
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    throw new Error("Hex color must use #RGB or #RRGGBB format");
  }
  const raw = match[1].length === 3
    ? match[1].split("").map((character) => character + character).join("")
    : match[1];
  const color = Number.parseInt(raw, 16);
  return {
    r: (color >> 16) & 255,
    g: (color >> 8) & 255,
    b: color & 255,
  };
}

function createColorBox(colors: WeightedColor[]): ColorBox {
  let minimumRed = 255;
  let minimumGreen = 255;
  let minimumBlue = 255;
  let maximumRed = 0;
  let maximumGreen = 0;
  let maximumBlue = 0;
  let count = 0;

  for (const color of colors) {
    minimumRed = Math.min(minimumRed, color.r);
    minimumGreen = Math.min(minimumGreen, color.g);
    minimumBlue = Math.min(minimumBlue, color.b);
    maximumRed = Math.max(maximumRed, color.r);
    maximumGreen = Math.max(maximumGreen, color.g);
    maximumBlue = Math.max(maximumBlue, color.b);
    count += color.count;
  }

  return {
    colors,
    count,
    redRange: maximumRed - minimumRed,
    greenRange: maximumGreen - minimumGreen,
    blueRange: maximumBlue - minimumBlue,
  };
}

function splitColorBox(box: ColorBox): [ColorBox, ColorBox] {
  const ranges = [box.redRange, box.greenRange, box.blueRange];
  const axis = ranges.indexOf(Math.max(...ranges));
  const channel = axis === 0 ? "r" : axis === 1 ? "g" : "b";
  const colors = [...box.colors].sort((left, right) =>
    left[channel] - right[channel]
      || left.r - right.r
      || left.g - right.g
      || left.b - right.b,
  );

  const midpoint = box.count / 2;
  let runningCount = 0;
  let splitAt = 1;
  for (let index = 0; index < colors.length - 1; index += 1) {
    runningCount += colors[index].count;
    splitAt = index + 1;
    if (runningCount >= midpoint) break;
  }

  return [
    createColorBox(colors.slice(0, splitAt)),
    createColorBox(colors.slice(splitAt)),
  ];
}

function representativeColor(box: ColorBox): RgbColor {
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const color of box.colors) {
    red += color.r * color.count;
    green += color.g * color.count;
    blue += color.b * color.count;
  }
  return {
    r: Math.round(red / box.count),
    g: Math.round(green / box.count),
    b: Math.round(blue / box.count),
  };
}

function quantize(histogram: Map<number, WeightedColor>, colorCount: number, sampleCount: number) {
  const boxes = [createColorBox([...histogram.values()])];

  while (boxes.length < colorCount) {
    let selectedIndex = -1;
    let selectedScore = -1;
    for (let index = 0; index < boxes.length; index += 1) {
      const box = boxes[index];
      if (box.colors.length < 2) continue;
      const score = Math.max(box.redRange, box.greenRange, box.blueRange) * box.count;
      if (score > selectedScore) {
        selectedIndex = index;
        selectedScore = score;
      }
    }
    if (selectedIndex < 0) break;
    const [left, right] = splitColorBox(boxes[selectedIndex]);
    boxes.splice(selectedIndex, 1, left, right);
  }

  const merged = new Map<string, { rgb: RgbColor; count: number }>();
  for (const box of boxes) {
    const rgb = representativeColor(box);
    const hex = rgbToHex(rgb);
    const existing = merged.get(hex);
    if (existing) existing.count += box.count;
    else merged.set(hex, { rgb, count: box.count });
  }

  return [...merged.entries()]
    .map(([hex, color]) => ({
      rgb: color.rgb,
      hex,
      count: color.count,
      share: color.count / sampleCount,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      if (left.hex < right.hex) return -1;
      if (left.hex > right.hex) return 1;
      return 0;
    });
}

/**
 * Extracts a deterministic palette from flat RGBA pixel data.
 *
 * All pixels are checked for valid byte channels. Visible pixels are then sampled
 * evenly across the input, keeping quantization work and memory bounded for large
 * images. An empty array is returned when no pixel meets the alpha threshold.
 */
export function extractPalette(
  rgba: ArrayLike<number>,
  options: ImagePaletteOptions = {},
): PaletteColor[] {
  if (!rgba || !Number.isSafeInteger(rgba.length) || rgba.length === 0) {
    throw new Error("RGBA pixel data must contain at least one pixel");
  }
  if (rgba.length % 4 !== 0) {
    throw new Error(`RGBA pixel data length must be a multiple of 4; received ${rgba.length}`);
  }

  const colorCount = options.colorCount ?? DEFAULT_COLOR_COUNT;
  const maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
  const minAlpha = options.minAlpha ?? DEFAULT_MIN_ALPHA;
  assertIntegerInRange(colorCount, 1, MAX_COLOR_COUNT, "colorCount");
  assertIntegerInRange(maxSamples, 1, MAX_SAMPLE_LIMIT, "maxSamples");
  assertIntegerInRange(minAlpha, 0, 255, "minAlpha");

  let visiblePixelCount = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    assertByte(rgba[index], `RGBA channel at index ${index}`);
    assertByte(rgba[index + 1], `RGBA channel at index ${index + 1}`);
    assertByte(rgba[index + 2], `RGBA channel at index ${index + 2}`);
    assertByte(rgba[index + 3], `RGBA channel at index ${index + 3}`);
    if (rgba[index + 3] >= minAlpha) visiblePixelCount += 1;
  }
  if (visiblePixelCount === 0) return [];

  const sampleCount = Math.min(visiblePixelCount, maxSamples);
  const histogram = new Map<number, WeightedColor>();
  let visibleIndex = 0;
  let sampleIndex = 0;
  let targetVisibleIndex = Math.floor((sampleIndex + 0.5) * visiblePixelCount / sampleCount);

  for (let index = 0; index < rgba.length && sampleIndex < sampleCount; index += 4) {
    if (rgba[index + 3] < minAlpha) continue;
    if (visibleIndex === targetVisibleIndex) {
      const red = rgba[index];
      const green = rgba[index + 1];
      const blue = rgba[index + 2];
      const key = (red << 16) | (green << 8) | blue;
      const existing = histogram.get(key);
      if (existing) existing.count += 1;
      else histogram.set(key, { r: red, g: green, b: blue, count: 1 });
      sampleIndex += 1;
      targetVisibleIndex = Math.floor((sampleIndex + 0.5) * visiblePixelCount / sampleCount);
    }
    visibleIndex += 1;
  }

  return quantize(histogram, colorCount, sampleCount);
}
