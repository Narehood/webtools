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

export function safeHttpHref(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
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
