export const FAVICON_PNG_SPECS = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "favicon-48x48.png", size: 48 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "android-chrome-192x192.png", size: 192 },
  { name: "android-chrome-512x512.png", size: 512 },
] as const;

export const FAVICON_ICO_SIZES = [16, 32, 48] as const;

export type FaviconPng = {
  name: string;
  size: number;
  data: Uint8Array;
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function isPng(data: Uint8Array) {
  return PNG_SIGNATURE.every((value, index) => data[index] === value);
}

export function faviconHtmlSnippet(prefix = "/") {
  const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return [
    `<link rel="icon" href="${base}favicon.ico" sizes="any">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${base}favicon-32x32.png">`,
    `<link rel="icon" type="image/png" sizes="16x16" href="${base}favicon-16x16.png">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${base}apple-touch-icon.png">`,
    `<link rel="manifest" href="${base}site.webmanifest">`,
  ].join("\n");
}

export function faviconManifest(appName = "Website") {
  const safeName = appName.trim().slice(0, 80) || "Website";
  return JSON.stringify({
    name: safeName,
    short_name: safeName.slice(0, 24),
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    theme_color: "#ffffff",
    background_color: "#ffffff",
    display: "standalone",
  }, null, 2);
}

export function buildPngIco(entries: readonly Pick<FaviconPng, "size" | "data">[]) {
  if (entries.length < 1 || entries.length > 65_535) throw new Error("ICO needs between 1 and 65,535 images");
  const seen = new Set<number>();
  for (const entry of entries) {
    if (!Number.isInteger(entry.size) || entry.size < 1 || entry.size > 256) throw new Error("ICO image sizes must be 1 to 256 pixels");
    if (seen.has(entry.size)) throw new Error("ICO image sizes must be unique");
    if (!isPng(entry.data)) throw new Error(`The ${entry.size}px ICO entry is not a PNG`);
    seen.add(entry.size);
  }

  const directoryBytes = 6 + entries.length * 16;
  const dataBytes = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0);
  const output = new Uint8Array(directoryBytes + dataBytes);
  const view = new DataView(output.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  let offset = directoryBytes;
  entries.forEach((entry, index) => {
    const start = 6 + index * 16;
    output[start] = entry.size === 256 ? 0 : entry.size;
    output[start + 1] = entry.size === 256 ? 0 : entry.size;
    output[start + 2] = 0;
    output[start + 3] = 0;
    view.setUint16(start + 4, 1, true);
    view.setUint16(start + 6, 32, true);
    view.setUint32(start + 8, entry.data.byteLength, true);
    view.setUint32(start + 12, offset, true);
    output.set(entry.data, offset);
    offset += entry.data.byteLength;
  });
  return output;
}

export async function buildFaviconZip(pngs: readonly FaviconPng[], appName: string) {
  const { strToU8, zipSync } = await import("fflate");
  const bySize = new Map(pngs.map((entry) => [entry.size, entry]));
  for (const spec of FAVICON_PNG_SPECS) {
    const entry = bySize.get(spec.size);
    if (!entry || entry.name !== spec.name) throw new Error(`Missing ${spec.name}`);
  }
  const ico = buildPngIco(FAVICON_ICO_SIZES.map((size) => {
    const entry = bySize.get(size);
    if (!entry) throw new Error(`Missing ${size}px PNG for favicon.ico`);
    return entry;
  }));
  const files: Record<string, Uint8Array> = {
    "favicon.ico": ico,
    "favicon.html": strToU8(faviconHtmlSnippet()),
    "site.webmanifest": strToU8(faviconManifest(appName)),
  };
  for (const spec of FAVICON_PNG_SPECS) files[spec.name] = (bySize.get(spec.size) as FaviconPng).data;
  return zipSync(files, { level: 6 });
}
