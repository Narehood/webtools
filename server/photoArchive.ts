import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { open, type Entry, type ZipFile } from "yauzl";
import { ZipFile as OutputZip } from "yazl";
import { safePhotoPath, editedPhotoPath, type PhotoRepairEntry, type PhotoRepairJob, type RepairOptions } from "../src/lib/photoRepair.ts";

export const MAX_PHOTOS = 5000;
export const MAX_PHOTO_BYTES = 150 * 1024 ** 2;
const MAX_EXPANDED_BYTES = 40 * 1024 ** 3;
const IMAGE_NAME = /\.(?:jpe?g|jfif|png|webp|tiff?|avif|heic|heif|gif)$/i;

export function openPhotoArchive(file: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => open(file, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true },
    (error, zip) => error ? reject(error) : resolve(zip!)));
}

export async function archiveEntries(zip: ZipFile) {
  // The central directory is small; compressed image data stays on disk.
  const entries: Entry[] = [];
  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => { cleanup(); reject(error); };
    const end = () => { cleanup(); resolve(); };
    const entry = (value: Entry) => {
      if (entries.length >= 25_000) { fail(new Error("ZIP has too many entries (maximum 25,000)")); return; }
      entries.push(value);
      zip.readEntry();
    };
    const cleanup = () => { zip.off("error", fail); zip.off("end", end); zip.off("entry", entry); };
    zip.on("error", fail); zip.on("end", end); zip.on("entry", entry);
    zip.readEntry();
  });
  return entries;
}

export async function indexPhotoArchive(file: string, options: RepairOptions) {
  const zip = await openPhotoArchive(file);
  try {
    const entries = await archiveEntries(zip);
    const photos: PhotoRepairEntry[] = [];
    const used = new Set<string>();
    let expanded = 0;
    let ignored = 0;
    for (const [index, entry] of entries.entries()) {
      if (entry.fileName.endsWith("/")) continue;
      const name = safePhotoPath(entry.fileName);
      if (name.startsWith("__MACOSX/") || name.split("/").pop()?.startsWith(".") || !IMAGE_NAME.test(name)) { ignored++; continue; }
      if ((entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000) throw new Error("Symbolic links are not supported in photo ZIPs");
      if (entry.isEncrypted()) throw new Error("Password-protected ZIPs are not supported");
      if (entry.uncompressedSize <= 0 || entry.uncompressedSize > MAX_PHOTO_BYTES) throw new Error(`${name}: each photo must be between 1 byte and 150 MB`);
      expanded += entry.uncompressedSize;
      if (expanded > MAX_EXPANDED_BYTES) throw new Error("Expanded photos exceed the 40 GB limit");
      if (photos.length >= MAX_PHOTOS) throw new Error(`Maximum ${MAX_PHOTOS} photos per ZIP`);
      photos.push({ id: index, source: name, output: editedPhotoPath(name, options.format, used), bytes: entry.uncompressedSize,
        status: "pending", rotation: 0, review: false, repaired: false });
    }
    if (!photos.length) throw new Error("No supported photos found. Use JPEG, PNG, TIFF, WebP, GIF, AVIF, or HEIF (if supported by this server).");
    photos.sort((a, b) => a.source.localeCompare(b.source, undefined, { numeric: true, sensitivity: "base" }) || a.id - b.id);
    return { photos, ignored };
  } finally { zip.close(); }
}

export async function extractPhoto(zip: ZipFile, entry: Entry, target: string) {
  const input = await new Promise<NodeJS.ReadableStream>((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream)));
  let bytes = 0;
  const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.length;
    callback(bytes > MAX_PHOTO_BYTES ? new Error("Expanded photo exceeds 150 MB") : null, chunk);
  } });
  await pipeline(input, limit, createWriteStream(target));
}

/** ZIP64 and backpressure are provided by yazl. No archive-sized Buffer or Blob is created. */
export function photoDownload(job: PhotoRepairJob, fileFor: (entry: PhotoRepairEntry) => string) {
  const zip = new OutputZip();
  for (const entry of job.entries) {
    if (entry.status === "done") zip.addFile(fileFor(entry), entry.output, { compress: false });
  }
  // A unique report name avoids colliding with a folder supplied by the user.
  zip.addBuffer(Buffer.from(JSON.stringify({ name: job.name, options: job.options, repairAttempts: job.repairAttempts,
    analysisAttempts: job.analysisAttempts, photos: job.entries }, null, 2)), "_webtools_report.json");
  zip.end();
  return zip;
}
