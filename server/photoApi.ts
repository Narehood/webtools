import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { stat } from "node:fs/promises";
import { photoJobs, photoJson, CHUNK_BYTES, MAX_ARCHIVE_BYTES, type PhotoJobStore } from "./photoJobs.ts";
import { MAX_PHOTOS, photoDownload } from "./photoArchive.ts";
import { imageModel, visionModel } from "./photoCloud.ts";
import { assertSameOrigin } from "./requestPolicy.ts";

const BASE = "/api/photo-repair";

function send(res: ServerResponse, status: number, payload: unknown) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

export async function handlePhotoApi(req: IncomingMessage, res: ServerResponse, store: PhotoJobStore = photoJobs) {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return false;
    // Commands and uploads must originate from this web UI, including when it is accessed over a LAN.
    assertSameOrigin(req);
    const parts = url.pathname.slice(BASE.length).split("/").filter(Boolean);
    if (parts[0] === "config" && req.method === "GET") {
      send(res, 200, { cloudAvailable: Boolean(process.env.OPENAI_API_KEY), maxArchiveBytes: MAX_ARCHIVE_BYTES,
        chunkBytes: CHUNK_BYTES, maxPhotos: MAX_PHOTOS, imageModel: imageModel(), visionModel: visionModel() });
    } else if (!parts.length && req.method === "GET") {
      send(res, 200, { jobs: await store.list() });
    } else if (!parts.length && req.method === "POST") {
      const body = await photoJson(req);
      send(res, 201, await store.create(body.name, body.size));
    } else if (parts.length === 1 && req.method === "GET") {
      send(res, 200, await store.uploadStatus(parts[0]));
    } else if (parts.length === 1 && req.method === "DELETE") {
      await store.remove(parts[0]); send(res, 200, { ok: true });
    } else if (parts.length === 2 && parts[1] === "upload" && req.method === "PUT") {
      const rawOffset = url.searchParams.get("offset");
      if (!rawOffset || !/^\d+$/.test(rawOffset)) throw new Error("Upload offset is required");
      send(res, 200, { uploaded: await store.upload(parts[0], Number(rawOffset), req) });
    } else if (parts.length === 2 && parts[1] === "finalize" && req.method === "POST") {
      send(res, 200, await store.finalize(parts[0]));
    } else if (parts.length === 2 && parts[1] === "start" && req.method === "POST") {
      const body = await photoJson(req);
      send(res, 200, await store.start(parts[0], body.options, body.limit, body.retry, body.cloudConsent));
    } else if (parts.length === 2 && parts[1] === "pause" && req.method === "POST") {
      send(res, 200, await store.pause(parts[0]));
    } else if (parts.length === 4 && parts[1] === "photos" && /^\d+$/.test(parts[2])) {
      const job = await store.get(parts[0]);
      const entry = job.entries.find((e) => e.id === Number(parts[2]));
      if (!entry) throw new Error("Photo not found");
      if (parts[3] === "rotate" && req.method === "POST") {
        const body = await photoJson(req);
        send(res, 200, await store.rotate(job.id, entry.id, body.rotation));
      } else if (parts[3] === "edit" && req.method === "POST") {
        const body = await photoJson(req);
        send(res, 200, await store.edit(job.id, entry.id, body.edit, body.version));
      } else if (parts[3] === "approve" && req.method === "POST") {
        send(res, 200, await store.approve(job.id, entry.id));
      } else if (["before", "after", "edit-base", "download"].includes(parts[3]) && req.method === "GET") {
        if (entry.status !== "done") throw new Error("Photo is not ready for preview or download");
        const download = parts[3] === "download";
        const file = download ? store.output(job, entry) : parts[3] === "after" ? store.resultPreview(job, entry)
          : store.preview(job.id, entry.id, parts[3] === "before" ? "before" : "after");
        const metadata = await stat(file);
        res.writeHead(200, { "Content-Type": download ? `image/${job.options.format}` : "image/jpeg", "Content-Length": metadata.size,
          "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
          ...(download ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(entry.output.split("/").pop()!)}` } : {}) });
        await pipeline(createReadStream(file), res);
      } else send(res, 404, { error: "Not found" });
    } else if (parts.length === 2 && parts[1] === "download" && req.method === "GET") {
      const job = await store.get(parts[0]);
      if (!job.entries.some((e) => e.status === "done")) throw new Error("Process at least one photo before downloading");
      const release = store.beginDownload(job.id);
      try {
        const zip = photoDownload(job, (entry) => store.output(job, entry));
        zip.on("error", (error: Error) => res.destroy(error));
        res.writeHead(200, { "Content-Type": "application/zip", "Cache-Control": "no-store", "Content-Disposition": "attachment; filename=edited-photos.zip" });
        await pipeline(zip.outputStream, res);
      } finally { release(); }
    } else send(res, 404, { error: "Not found" });
  } catch (error) {
    if (res.headersSent) res.destroy();
    else send(res, 400, { error: error instanceof Error ? error.message : "Photo request failed" });
  }
  return true;
}
