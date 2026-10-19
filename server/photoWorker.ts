import { parentPort, workerData } from "node:worker_threads";
import sharp from "sharp";
import { analyzeColorCast, correctPixels, DEFAULT_ADJUSTMENTS, identityAnalysis, withNeutralSpot, sampleSpot, type ColorAnalysis, type NeutralSpot } from "../src/lib/photoColor.ts";
import type { RepairOptions, ManualPhotoEdit } from "../src/lib/photoRepair.ts";

// Pixel loops run away from the HTTP event loop. Native codecs use sharp's bounded thread pool.
sharp.cache(false);
sharp.concurrency(2);

export type LocalPhotoTask = { input: string; output: string; before?: string; options: RepairOptions; manual?: ManualPhotoEdit; analysis?: ColorAnalysis };
export type MeasurePhotoTask = { input: string; measure: true; analysis?: ColorAnalysis; neutral: NeutralSpot | null };

async function measureColor(data: Buffer, width: number, height: number) {
  const sample = await sharp(data, { raw: { width, height, channels: 4 } })
    .resize(1000, 1000, { fit: "inside", withoutEnlargement: true, kernel: "nearest" }).raw().toBuffer({ resolveWithObject: true });
  return analyzeColorCast({ data: sample.data, width: sample.info.width, height: sample.info.height });
}

export async function measureLocalPhoto(task: MeasurePhotoTask) {
  const { data, info } = await sharp(task.input, { limitInputPixels: 60_000_000, failOn: "error" })
    .autoOrient().toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const analysis = task.analysis || await measureColor(data, info.width, info.height);
  const neutral = task.neutral ? sampleSpot({ data, width: info.width, height: info.height }, task.neutral) : null;
  return { analysis, neutral };
}

export async function prepareLocalPhoto(task: LocalPhotoTask) {
  const image = sharp(task.input, { limitInputPixels: 60_000_000, failOn: "error" }).autoOrient().toColourspace("srgb");
  if (task.manual && Object.values(task.manual.adjustments).every((value) => value === 0)) {
    // Quarter turns use the native codec path when no color correction is needed.
    const result = await image.rotate(task.manual.rotation).flatten({ background: "white" })
      .toFormat(task.options.format, task.options.format === "png" ? {} : { quality: 95 }).toFile(task.output);
    return { width: result.width, height: result.height };
  }
  const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = { data, width: info.width, height: info.height };
  if (task.before) await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).resize(1000, 850, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 }).toFile(task.before);
  if (task.manual || task.options.color) {
    const analysis = task.manual && task.manual.adjustments.strength === 0 ? identityAnalysis()
      : task.analysis || await measureColor(data, info.width, info.height);
    const clamped = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    correctPixels(pixels.data, task.manual ? withNeutralSpot(analysis, pixels, task.manual.neutral) : analysis,
      task.manual?.adjustments || { ...DEFAULT_ADJUSTMENTS, strength: task.options.strength }, clamped);
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .rotate(task.manual?.rotation || 0).flatten({ background: "white" })
    // PNG's quality option enables palette quantization; omit it for lossless pixels.
    .toFormat(task.options.format, task.options.format === "png" ? {} : { quality: 95 }).toFile(task.output);
  const sideways = task.manual?.rotation === 90 || task.manual?.rotation === 270;
  return { width: sideways ? info.height : info.width, height: sideways ? info.width : info.height };
}

if (parentPort) {
  const result = workerData.measure ? measureLocalPhoto(workerData as MeasurePhotoTask) : prepareLocalPhoto(workerData as LocalPhotoTask);
  result.then((result) => parentPort!.postMessage({ result }))
    .catch((error: unknown) => parentPort!.postMessage({ error: error instanceof Error ? error.message : "Could not process photo" }));
}
