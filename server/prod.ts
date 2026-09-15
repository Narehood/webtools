import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = Number(process.env.PORT ?? 8080);

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  if (await handleApi(req, res)) return;

  const url = new URL(req.url ?? "/", "http://localhost");
  const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(root, safePath);

  try {
    const indexFallback = path.join(root, "index.html");
    const candidate = !path.extname(safePath) ? indexFallback : filePath;
    await access(candidate);
    filePath = candidate;
  } catch {
    filePath = path.join(root, "index.html");
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", mime[path.extname(filePath)] ?? "application/octet-stream");
  createReadStream(filePath).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`WebTools ready on http://0.0.0.0:${port}`);
});
