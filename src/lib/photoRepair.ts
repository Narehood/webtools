import { ADJUSTMENT_RANGES, type ColorAdjustments, type NeutralSpot } from "./photoColor.ts";

export type RepairRotation = 0 | 90 | 180 | 270;
export type ManualPhotoEdit = { rotation: RepairRotation; adjustments: ColorAdjustments; neutral: NeutralSpot | null };

export function defaultManualEdit(): ManualPhotoEdit {
  return { rotation: 0, adjustments: { strength: 0, warmth: 0, tint: 0, brightness: 0, contrast: 0, saturation: 0 }, neutral: null };
}

export function manualPhotoEdit(value: unknown): ManualPhotoEdit {
  if (!value || typeof value !== "object") throw new Error("Choose photo adjustments");
  const edit = value as Record<string, unknown>;
  if (![0, 90, 180, 270].includes(edit.rotation as number) || !edit.adjustments || typeof edit.adjustments !== "object") throw new Error("Invalid manual photo edit");
  const supplied = edit.adjustments as Record<string, unknown>;
  const adjustments = {} as ColorAdjustments;
  for (const key of Object.keys(ADJUSTMENT_RANGES) as (keyof ColorAdjustments)[]) {
    const value = supplied[key];
    const [low, high] = ADJUSTMENT_RANGES[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) throw new Error(`${key} must be from ${low} to ${high}`);
    adjustments[key] = value;
  }
  let neutral: NeutralSpot | null = null;
  if (edit.neutral != null) {
    const spot = edit.neutral as NeutralSpot;
    if (typeof spot.x !== "number" || typeof spot.y !== "number" || !Number.isFinite(spot.x) || !Number.isFinite(spot.y)
      || spot.x < 0 || spot.x > 1 || spot.y < 0 || spot.y > 1) throw new Error("Neutral spot must be inside the photo");
    neutral = { x: spot.x, y: spot.y };
  }
  return { rotation: edit.rotation as RepairRotation, adjustments, neutral };
}
export type RepairOptions = {
  color: boolean;
  strength: number;
  orientation: "metadata" | "scene";
  repair: "off" | "auto" | "all";
  format: "jpeg" | "png" | "webp";
  maxRepairs: number;
};

export const DEFAULT_REPAIR_OPTIONS: RepairOptions = {
  color: true, strength: 100, orientation: "metadata", repair: "off", format: "jpeg", maxRepairs: 25,
};

export type PhotoRepairEntry = {
  id: number;
  source: string;
  output: string;
  bytes: number;
  status: "pending" | "processing" | "done" | "failed";
  rotation: RepairRotation;
  review: boolean;
  repaired: boolean;
  note?: string;
  error?: string;
  width?: number;
  height?: number;
  analysis?: { rotation: RepairRotation; confidence: number; damaged: boolean; note: string };
  cloudInFlight?: boolean;
  manual?: ManualPhotoEdit;
  editVersion?: number;
  reviewedAt?: string;
};

export type PhotoRepairJob = {
  id: string;
  name: string;
  size: number;
  uploaded: number;
  createdAt: string;
  updatedAt: string;
  state: "uploading" | "indexing" | "ready" | "running" | "paused" | "complete";
  options: RepairOptions;
  entries: PhotoRepairEntry[];
  ignored: number;
  repairAttempts: number;
  analysisAttempts: number;
  error?: string;
};

export type PhotoRepairConfig = {
  cloudAvailable: boolean;
  maxArchiveBytes: number;
  chunkBytes: number;
  maxPhotos: number;
  imageModel: string;
  visionModel: string;
};

export function usesCloud(options: RepairOptions) {
  return options.orientation === "scene" || options.repair !== "off";
}

export function repairOptions(value: unknown): RepairOptions {
  if (!value || typeof value !== "object") throw new Error("Choose processing settings");
  const o = value as Record<string, unknown>;
  if (typeof o.color !== "boolean" || typeof o.strength !== "number" || !Number.isFinite(o.strength) || o.strength < 0 || o.strength > 100
    || !["metadata", "scene"].includes(String(o.orientation)) || !["off", "auto", "all"].includes(String(o.repair))
    || !["jpeg", "png", "webp"].includes(String(o.format)) || !Number.isInteger(o.maxRepairs) || Number(o.maxRepairs) < 0 || Number(o.maxRepairs) > 5000) {
    throw new Error("Invalid processing settings");
  }
  return { color: o.color, strength: o.strength, orientation: o.orientation as RepairOptions["orientation"],
    repair: o.repair as RepairOptions["repair"], format: o.format as RepairOptions["format"], maxRepairs: Number(o.maxRepairs) };
}

/** Keep archive paths portable and relative. The server stores outputs by numeric ID, never by these paths. */
export function safePhotoPath(name: string) {
  const path = name.replace(/\\/g, "/");
  if (!path || path.length > 1024 || path.startsWith("/") || /[\x00-\x1f\x7f:]/.test(path)
    || path.split("/").some((part) => part === ".." || part === "." || !part)) throw new Error("ZIP contains an unsafe file path");
  return path;
}

export function editedPhotoPath(name: string, format: RepairOptions["format"], used: Set<string>) {
  const path = safePhotoPath(name);
  const stem = path.replace(/\.[^/.]+$/, "");
  const ext = format === "jpeg" ? "jpg" : format;
  let result = `${stem}_edited.${ext}`;
  for (let copy = 2; used.has(result.toLowerCase()); copy++) result = `${stem}_edited_${copy}.${ext}`;
  used.add(result.toLowerCase());
  return result;
}

export function repairBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}
