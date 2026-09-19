import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
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

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  if (await handleApi(req, res)) return;

  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end("Invalid path");
    return;
  }
  let filePath = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, filePath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    res.writeHead(400).end("Invalid path");
    return;
  }

  try {
    if (!path.extname(pathname)) filePath = path.join(root, "index.html");
    if (!(await stat(filePath)).isFile()) throw new Error("Not a file");
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", mime[path.extname(filePath)] ?? "application/octet-stream");
  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (res.headersSent) res.destroy();
    else res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Could not read file");
  });
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

const server = createServer((req, res) => {
  void handleRequest(req, res).catch(() => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) res.destroy();
    else res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Request failed");
  });
});

server.listen(port, "0.0.0.0", () => {
  const address = server.address();
  console.log(`WebTools ready on http://0.0.0.0:${typeof address === "object" && address ? address.port : port}`);
});
