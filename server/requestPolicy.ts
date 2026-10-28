import type { IncomingMessage } from "node:http";

export function assertSameOrigin(req: IncomingMessage) {
  const site = req.headers["sec-fetch-site"];
  const origin = req.headers.origin;
  if (origin === "null" || (site !== undefined && site !== "same-origin" && site !== "none"))
    throw new Error("Cross-origin API access is not allowed");

  // Fetch Metadata describes the browser's original URL, even when a proxy rewrites Host.
  if (site === undefined && origin !== undefined) {
    const url = new URL(origin);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
        url.host !== new URL(`${url.protocol}//${req.headers.host}`).host)
      throw new Error("Cross-origin API access is not allowed");
  }
}

export function assertJsonPost(req: IncomingMessage) {
  if (req.method === "POST" && req.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "application/json")
    throw new Error("API commands require Content-Type: application/json");
}
