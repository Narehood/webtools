export const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;

type FileLike = Pick<File, "name" | "size" | "type">;

const RASTER_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
]);
const RASTER_IMAGE_EXTENSIONS = /\.(?:png|jpe?g|webp|gif|bmp|avif)$/i;

export function assertImageFile(file: FileLike, maxBytes = MAX_IMAGE_FILE_BYTES) {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error("Choose a non-empty image file");
  if (file.size > maxBytes) throw new Error(`Image is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB`);
  const knownType = RASTER_IMAGE_TYPES.has(file.type.toLowerCase());
  if (!knownType && !(file.type === "" && RASTER_IMAGE_EXTENSIONS.test(file.name))) {
    throw new Error("Choose a PNG, JPEG, WebP, GIF, BMP, or AVIF image");
  }
}

export function assertImageDimensions(width: number, height: number, maxPixels = MAX_IMAGE_PIXELS) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Image has invalid dimensions");
  }
  if (width * height > maxPixels) {
    throw new Error(`Image has too many pixels. Maximum is ${Math.round(maxPixels / 1_000_000)} megapixels`);
  }
}

/** Enough of a file to reach a JPEG frame header past large EXIF, thumbnail, and color-profile blocks. */
export const IMAGE_HEADER_BYTES = 512 * 1024;

const u16be = (bytes: Uint8Array, at: number) => (bytes[at] << 8) | bytes[at + 1];
const u16le = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8);
const u24le = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
const u32be = (bytes: Uint8Array, at: number) => bytes[at] * 0x1000000 + ((bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]);
const i32le = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24);

function startsWith(bytes: Uint8Array, at: number, expected: string | readonly number[]) {
  const values = typeof expected === "string" ? [...expected].map((character) => character.charCodeAt(0)) : expected;
  return bytes.length >= at + values.length && values.every((value, index) => bytes[at + index] === value);
}

function jpegDimensions(bytes: Uint8Array) {
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { at += 2; continue; }
    // End of image or start of scan before any frame header.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(bytes, at + 2);
    if (length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return at + 9 <= bytes.length ? { width: u16be(bytes, at + 7), height: u16be(bytes, at + 5) } : null;
    at += 2 + length;
  }
  return null;
}

function headerDimensions(bytes: Uint8Array) {
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && startsWith(bytes, 12, "IHDR") && bytes.length >= 24) {
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (startsWith(bytes, 0, [0xff, 0xd8])) return jpegDimensions(bytes);
  if (startsWith(bytes, 0, "GIF8") && bytes.length >= 10) return { width: u16le(bytes, 6), height: u16le(bytes, 8) };
  if (startsWith(bytes, 0, "BM") && bytes.length >= 26) {
    const infoSize = u16le(bytes, 14) + u16le(bytes, 16) * 0x10000;
    if (infoSize === 12) return { width: u16le(bytes, 18), height: u16le(bytes, 20) };
    // Height is negative for top-down bitmaps.
    return infoSize >= 40 ? { width: Math.abs(i32le(bytes, 18)), height: Math.abs(i32le(bytes, 22)) } : null;
  }
  if (startsWith(bytes, 0, "RIFF") && startsWith(bytes, 8, "WEBP")) {
    if (startsWith(bytes, 12, "VP8X") && bytes.length >= 30) return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
    if (startsWith(bytes, 12, "VP8L") && bytes[20] === 0x2f && bytes.length >= 25) {
      return {
        width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)),
        height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)),
      };
    }
    if (startsWith(bytes, 12, "VP8 ") && bytes.length >= 30) return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  }
  return null;
}

/**
 * Reads width and height from a PNG, JPEG, GIF, BMP, or WebP header, so an oversized image can be
 * refused before the browser decodes it. Returns null for other formats or a header that is cut off.
 */
export function readImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const size = headerDimensions(bytes);
  return size && size.width > 0 && size.height > 0 ? size : null;
}

export function fitImageDimensions(width: number, height: number, maxPixels: number, maxSide: number) {
  assertImageDimensions(width, height, Number.MAX_SAFE_INTEGER);
  if (!Number.isFinite(maxPixels) || maxPixels <= 0 || !Number.isFinite(maxSide) || maxSide <= 0) {
    throw new Error("Output bounds must be positive");
  }
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)), maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

export function fileStem(name: string, fallback = "output") {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  const safe = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return safe || fallback;
}
