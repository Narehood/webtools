import type { IncomingMessage, ServerResponse } from "node:http";
import { connect as tlsConnect } from "node:tls";
import { createConnection, isIP } from "node:net";
import { lookup as dnsLookup, reverse as dnsReverse, resolve4, resolve6, resolveCname, resolveMx, resolveNs, resolveTxt } from "node:dns/promises";
import whoiser from "whoiser";

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 65_536) {
        chunks.length = 0;
        reject(new Error("JSON body must be no larger than 64 KiB"));
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      if (size > 65_536) return;
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected an object");
        resolve(body as Record<string, unknown>);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("Request aborted")));
  });
}

function send(res: ServerResponse, status: number, payload: unknown) {
  if (res.destroyed || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a URL or hostname");
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("That does not look like a valid URL");
  }
}

function hostnameFrom(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) throw new Error("Enter a domain");
  try {
    if (trimmed.includes("://")) return new URL(trimmed).hostname;
  } catch {
    throw new Error("That does not look like a valid domain");
  }
  return trimmed.replace(/\/.*$/, "").replace(/^\.+|\.+$/g, "");
}

async function checkStatus(rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response: Response | undefined;

  try {
    try {
      response = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "WebTools-Status/0.1" },
      });
    } catch {
      // Some servers disconnect HEAD requests; retry with GET below.
    }
    if (!response || response.status === 405 || response.status === 501) {
      await response?.body?.cancel();
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "WebTools-Status/0.1" },
      });
    }

    return {
      up: response.ok || (response.status >= 100 && response.status < 500),
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      redirected: response.redirected,
      ms: Math.round(performance.now() - started),
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      up: false,
      ok: false,
      status: 0,
      statusText: error instanceof Error && error.name === "AbortError" ? "Timed out" : "Unreachable",
      url: url.toString(),
      redirected: false,
      ms: Math.round(performance.now() - started),
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Request failed",
    };
  } finally {
    await response?.body?.cancel().catch(() => {});
    controller.abort();
    clearTimeout(timeout);
  }
}

async function lookupWhois(domain: string) {
  const host = hostnameFrom(domain);
  const result = await whoiser(host, { timeout: 8000, follow: 2 });
  return { domain: host, result };
}

async function lookupDns(domain: string) {
  const host = hostnameFrom(domain);
  const [a, aaaa, cname, mx, ns, txt, first] = await Promise.allSettled([
    resolve4(host),
    resolve6(host),
    resolveCname(host),
    resolveMx(host),
    resolveNs(host),
    resolveTxt(host),
    dnsLookup(host, { all: true }),
  ]);

  const value = <T>(item: PromiseSettledResult<T>): T | [] =>
    item.status === "fulfilled" ? item.value : [];

  return {
    domain: host,
    a: value(a),
    aaaa: value(aaaa),
    cname: value(cname),
    mx: value(mx),
    ns: value(ns),
    txt: value(txt).map((entry) => entry.join("")),
    addresses: value(first),
  };
}

async function checkSsl(raw: string) {
  const url = normalizeUrl(raw);
  const host = url.hostname;
  const port = url.port ? Number(url.port) : 443;

  return await new Promise((resolve, reject) => {
    const socket = tlsConnect(
      { host, port, servername: host, rejectUnauthorized: false, timeout: 8000 },
      () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const authorizationError = socket.authorizationError
          ? String(socket.authorizationError)
          : null;
        const protocol = socket.getProtocol();
        socket.end();
        if (!cert || Object.keys(cert).length === 0) {
          reject(new Error("No certificate presented"));
          return;
        }
        const expires = new Date(cert.valid_to);
        resolve({
          host,
          port,
          authorized,
          authorizationError,
          protocol,
          subject: cert.subject,
          issuer: cert.issuer,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining: Math.round((expires.getTime() - Date.now()) / 86_400_000),
          fingerprint256: cert.fingerprint256,
          serialNumber: cert.serialNumber,
          altNames: cert.subjectaltname ?? "",
        });
      },
    );
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Timed out"));
    });
  });
}

async function traceHeaders(raw: string) {
  let current = normalizeUrl(raw).toString();
  const chain: {
    url: string;
    status: number;
    statusText: string;
    location: string | null;
    headers: Record<string, string>;
  }[] = [];

  for (let hop = 0; hop < 10; hop += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response: Response | undefined;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "WebTools-Headers/0.1" },
      });
      const headers = Object.fromEntries(response.headers.entries());
      const location = response.headers.get("location");
      chain.push({
        url: current,
        status: response.status,
        statusText: response.statusText,
        location,
        headers,
      });
      if (!location || response.status < 300 || response.status >= 400) break;
      current = new URL(location, current).toString();
    } finally {
      await response?.body?.cancel().catch(() => {});
      controller.abort();
      clearTimeout(timeout);
    }
  }

  return { chain };
}

async function lookupMail(domain: string) {
  const host = hostnameFrom(domain);
  const selectors = ["default", "google", "selector1", "selector2", "k1", "s1", "s2", "mail"];
  const [mx, txt, dmarc, ...dkimSettled] = await Promise.allSettled([
    resolveMx(host),
    resolveTxt(host),
    resolveTxt(`_dmarc.${host}`),
    ...selectors.map((selector) => resolveTxt(`${selector}._domainkey.${host}`)),
  ]);

  const fulfilled = <T>(item: PromiseSettledResult<T>): T | [] =>
    item.status === "fulfilled" ? item.value : [];

  const txtRecords = fulfilled(txt).map((entry) => entry.join(""));
  const dkim = selectors
    .map((selector, index) => {
      const records = fulfilled(dkimSettled[index]).map((entry) => entry.join(""));
      return records.length ? { selector, records } : null;
    })
    .filter((item): item is { selector: string; records: string[] } => Boolean(item));

  return {
    domain: host,
    mx: fulfilled(mx),
    spf: txtRecords.filter((record) => record.toLowerCase().startsWith("v=spf1")),
    txt: txtRecords,
    dmarc: fulfilled(dmarc).map((entry) => entry.join("")),
    dkim,
  };
}

function parsePortNumber(raw: unknown): number {
  const value = Number(String(raw ?? "").trim());
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("Port must be a whole number from 1 to 65535");
  }
  return value;
}

function parseReachableHost(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter a hostname or IP");
  if (/[,\s]/.test(trimmed.replace(/^\[|\]$/g, ""))) {
    throw new Error("One host at a time");
  }
  try {
    if (trimmed.includes("://")) return new URL(trimmed).hostname;
  } catch {
    throw new Error("That does not look like a valid host");
  }
  if (trimmed.startsWith("[")) {
    const match = trimmed.match(/^\[([^\]]+)\]/);
    if (!match) throw new Error("That IPv6 address is missing a closing bracket");
    return match[1];
  }
  return trimmed.replace(/\/.*$/, "");
}

async function checkPort(rawHost: string, rawPort: unknown) {
  const host = parseReachableHost(rawHost);
  const port = parsePortNumber(rawPort);
  const started = performance.now();

  return await new Promise<{
    open: boolean;
    host: string;
    port: number;
    ms: number;
    error?: string;
  }>((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (result: { open: boolean; error?: string }) => {
      const ms = Math.round(performance.now() - started);
      socket.removeAllListeners();
      socket.destroy();
      resolve({ host, port, ms, ...result });
    };
    socket.setTimeout(4000);
    socket.on("connect", () => finish({ open: true }));
    socket.on("timeout", () => finish({ open: false, error: "Timed out" }));
    socket.on("error", (error) => finish({ open: false, error: error.message }));
  });
}

async function lookupEgress() {
  const read = async (url: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "WebTools-Egress/0.1" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    const trace = await read("https://1.1.1.1/cdn-cgi/trace");
    const ip = trace.match(/^ip=(.+)$/m)?.[1]?.trim() ?? "";
    if (!ip) throw new Error("empty");
    return { ip, source: "cloudflare", checkedAt: new Date().toISOString() };
  } catch {
    const body = JSON.parse(await read("https://api.ipify.org?format=json")) as { ip?: string };
    const ip = body.ip?.trim() ?? "";
    if (!ip) throw new Error("Could not read this host’s public IP");
    return { ip, source: "ipify", checkedAt: new Date().toISOString() };
  }
}

async function lookupPtr(raw: string) {
  const ip = raw.trim();
  if (!isIP(ip)) throw new Error("Enter an IPv4 or IPv6 address");
  try {
    const names = await dnsReverse(ip);
    return { ip, names };
  } catch (error) {
    return {
      ip,
      names: [] as string[],
      error: error instanceof Error ? error.message : "No PTR record",
    };
  }
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      send(res, 200, { ok: true, service: "webtools" });
      return true;
    }

    if (url.pathname === "/api/status" && req.method === "POST") {
      const body = await readJson(req);
      const target = String(body.url ?? body.host ?? "");
      send(res, 200, await checkStatus(target));
      return true;
    }

    if (url.pathname === "/api/whois" && req.method === "POST") {
      const body = await readJson(req);
      send(res, 200, await lookupWhois(String(body.domain ?? body.host ?? "")));
      return true;
    }

    if (url.pathname === "/api/dns" && req.method === "POST") {
      const body = await readJson(req);
      send(res, 200, await lookupDns(String(body.domain ?? body.host ?? "")));
      return true;
    }

    if (url.pathname === "/api/ssl" && req.method === "POST") {
      const body = await readJson(req);
      send(res, 200, await checkSsl(String(body.url ?? body.host ?? body.domain ?? "")));
      return true;
    }

    if (url.pathname === "/api/headers" && req.method === "POST") {
      const body = await readJson(req);
      send(res, 200, await traceHeaders(String(body.url ?? body.host ?? "")));
      return true;
    }

    if (url.pathname === "/api/mail" && req.method === "POST") {
      const body = await readJson(req);
      send(res, 200, await lookupMail(String(body.domain ?? body.host ?? "")));
      return true;
    }

    if (url.pathname === "/api/port" && req.method === "POST") {
      const body = await readJson(req);
      send(res, 200, await checkPort(String(body.host ?? body.url ?? ""), body.port ?? body.target ?? ""));
      return true;
    }

    if ((url.pathname === "/api/egress" && (req.method === "GET" || req.method === "POST"))) {
      send(res, 200, await lookupEgress());
      return true;
    }

    if (url.pathname === "/api/ptr" && req.method === "POST") {
      const body = await readJson(req);
      send(res, 200, await lookupPtr(String(body.ip ?? body.host ?? body.address ?? "")));
      return true;
    }

    send(res, 404, { error: "Not found" });
    return true;
  } catch (error) {
    send(res, 400, { error: error instanceof Error ? error.message : "Request failed" });
    return true;
  }
}
