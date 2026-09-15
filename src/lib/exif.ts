import exifr from "exifr";

const SKIP = new Set([
  "MakerNote",
  "UserComment",
  "ImageUniqueID",
  "thumbnail",
  "Thumbnail",
  "exif",
]);

export async function readExif(file: File) {
  const parsed = (await exifr.parse(file, {
    gps: true,
    exif: true,
    iptc: true,
    xmp: true,
    interop: true,
    jfif: true,
    ihdr: true,
    translateKeys: true,
    translateValues: true,
    reviveValues: true,
    mergeOutput: true,
    sanitize: true,
  })) as Record<string, unknown> | undefined;
  return parsed ?? {};
}

export function formatMeta(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().replace(".000Z", "Z");
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return "(binary)";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function isDisplayable([key, value]: [string, unknown]) {
  if (SKIP.has(key)) return false;
  if (value == null) return false;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return false;
  const text = formatMeta(value);
  return text.length > 0 && text.length < 400 && text !== "(binary)";
}

export function gpsOf(meta: Record<string, unknown>) {
  const lat = Number(meta.latitude ?? meta.GPSLatitude);
  const lng = Number(meta.longitude ?? meta.GPSLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export function pick(meta: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = meta[key];
    if (value != null && formatMeta(value) !== "—") return formatMeta(value);
  }
  return "";
}
