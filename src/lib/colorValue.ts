export type Rgb = { r: number; g: number; b: number };

function channel(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 255) return null;
  return value;
}

function opaqueAlpha(alpha: string | undefined) {
  if (alpha == null) return true;
  if (alpha.endsWith("%")) return Number(alpha.slice(0, -1)) === 100;
  return Number(alpha) === 1;
}

export function parseColor(input: string): Rgb | null {
  const text = input.trim();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].split("").map((char) => char + char).join("") : hex[1];
    const value = Number.parseInt(raw, 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+%?))?\s*\)$/i.exec(text);
  if (rgb) {
    if (!opaqueAlpha(rgb[4])) return null;
    const red = channel(Number(rgb[1]));
    const green = channel(Number(rgb[2]));
    const blue = channel(Number(rgb[3]));
    if (red == null || green == null || blue == null) return null;
    return { r: red, g: green, b: blue };
  }
  const hsl = /^hsla?\(\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)%\s*,\s*(\d{1,3}(?:\.\d+)?)%(?:\s*,\s*(\d*\.?\d+%?))?\s*\)$/i.exec(text);
  if (!hsl) return null;
  if (!opaqueAlpha(hsl[4])) return null;
  const hue = Number(hsl[1]);
  const saturation = Number(hsl[2]);
  const lightness = Number(hsl[3]);
  if (hue > 360 || saturation > 100 || lightness > 100) return null;
  return hslToRgb(hue, saturation, lightness);
}

export function formatHex(color: Rgb) {
  return `#${[color.r, color.g, color.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function formatRgb(color: Rgb) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

export function rgbToHsl(color: Rgb) {
  const red = color.r / 255;
  const green = color.g / 255;
  const blue = color.b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(lightness * 100) };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  return { h: hue, s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
}

export function formatHsl(color: Rgb) {
  const { h, s, l } = rgbToHsl(color);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hue < 60) [red, green, blue] = [c, x, 0];
  else if (hue < 120) [red, green, blue] = [x, c, 0];
  else if (hue < 180) [red, green, blue] = [0, c, x];
  else if (hue < 240) [red, green, blue] = [0, x, c];
  else if (hue < 300) [red, green, blue] = [x, 0, c];
  else [red, green, blue] = [c, 0, x];
  return {
    r: Math.round((red + m) * 255),
    g: Math.round((green + m) * 255),
    b: Math.round((blue + m) * 255),
  };
}
