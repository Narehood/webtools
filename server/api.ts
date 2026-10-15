import type { IncomingMessage, ServerResponse } from "node:http";
import { connect as tlsConnect } from "node:tls";
import { createConnection, isIP } from "node:net";
import { Resolver, lookup as dnsLookup, reverse as dnsReverse, resolve4, resolve6, resolveCname, resolveMx, resolveNs, resolveTxt } from "node:dns/promises";
import whoiser from "whoiser";
import {
  compareDnsResolvers,
  normalizeDnsHostname,
  runDomainHealthChecks,
  type HealthMailData,
  type HealthTlsData,
} from "./networkTools.ts";

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

async function checkStatus(rawUrl: string, timeoutMs = 8000) {
  const url = normalizeUrl(rawUrl);
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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

async function checkSsl(raw: string, timeoutMs = 8000): Promise<HealthTlsData & Record<string, unknown>> {
  const url = normalizeUrl(raw);
  const host = url.hostname;
  const port = url.port ? Number(url.port) : 443;

  return await new Promise<HealthTlsData & Record<string, unknown>>((resolve, reject) => {
    const socket = tlsConnect(
      { host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs },
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

async function traceHeaders(
  raw: string,
  limits: { maxHops?: number; timeoutMs?: number; totalTimeoutMs?: number } = {},
) {
  let current = normalizeUrl(raw).toString();
  const maxHops = limits.maxHops ?? 10;
  const timeoutMs = limits.timeoutMs ?? 8000;
  const deadline = performance.now() + (limits.totalTimeoutMs ?? maxHops * timeoutMs);
  const chain: {
    url: string;
    status: number;
    statusText: string;
    location: string | null;
    headers: Record<string, string>;
  }[] = [];

  for (let hop = 0; hop < maxHops; hop += 1) {
    const remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0) throw new Error("Header trace timed out");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
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
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Header trace timed out");
      throw error;
    } finally {
      await response?.body?.cancel().catch(() => {});
      controller.abort();
      clearTimeout(timeout);
    }
  }

  return { chain };
}

type MailDnsClient = {
  resolveMx: (hostname: string) => ReturnType<typeof resolveMx>;
  resolveTxt: (hostname: string) => ReturnType<typeof resolveTxt>;
};

const defaultMailDns: MailDnsClient = {
  resolveMx: (hostname) => resolveMx(hostname),
  resolveTxt: (hostname) => resolveTxt(hostname),
};

function settledDnsFailure<T>(result: PromiseSettledResult<T>) {
  if (result.status === "fulfilled") return undefined;
  const code = result.reason && typeof result.reason === "object" && "code" in result.reason
    ? String((result.reason as { code?: unknown }).code ?? "").toUpperCase()
    : "";
  if (code === "ENODATA" || code === "DNS_ENODATA" || code === "ENOTFOUND" || code === "DNS_ENOTFOUND") {
    return undefined;
  }
  if (code === "ETIMEOUT" || code === "DNS_ETIMEOUT" || code === "ECANCELLED" || code === "DNS_ECANCELLED") {
    return "Timed out";
  }
  return result.reason instanceof Error && result.reason.message ? result.reason.message : "DNS query failed";
}

async function lookupMailDetailed(domain: string, dns: MailDnsClient = defaultMailDns) {
  const host = hostnameFrom(domain);
  const selectors = ["default", "google", "selector1", "selector2", "k1", "s1", "s2", "mail"];
  const [mx, txt, dmarc, ...dkimSettled] = await Promise.allSettled([
    dns.resolveMx(host),
    dns.resolveTxt(host),
    dns.resolveTxt(`_dmarc.${host}`),
    ...selectors.map((selector) => dns.resolveTxt(`${selector}._domainkey.${host}`)),
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

  const lookupErrors = {
    mx: settledDnsFailure(mx),
    txt: settledDnsFailure(txt),
    dmarc: settledDnsFailure(dmarc),
  };

  return {
    domain: host,
    mx: fulfilled(mx),
    spf: txtRecords.filter((record) => record.toLowerCase().startsWith("v=spf1")),
    txt: txtRecords,
    dmarc: fulfilled(dmarc).map((entry) => entry.join("")),
    dkim,
    lookupErrors,
  };
}

async function lookupMail(domain: string) {
  const { lookupErrors: _lookupErrors, ...result } = await lookupMailDetailed(domain);
  return result;
}

async function lookupHealthMail(domain: string): Promise<HealthMailData> {
  const timeoutMs = 2_250;
  const resolver = new Resolver({ timeout: timeoutMs, tries: 1, maxTimeout: timeoutMs });
  const timer = setTimeout(() => resolver.cancel(), timeoutMs + 250);
  try {
    return await lookupMailDetailed(domain, {
      resolveMx: (hostname) => resolver.resolveMx(hostname),
      resolveTxt: (hostname) => resolver.resolveTxt(hostname),
    });
  } finally {
    clearTimeout(timer);
    resolver.cancel();
  }
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

const SITE_FILES = [
  { name: "robots.txt", path: "/robots.txt" },
  { name: "security.txt", path: "/.well-known/security.txt" },
  { name: "security.txt (root)", path: "/security.txt" },
];

export function siteFileTarget(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter a domain");

  let hostname = "";
  let port = "";
  if (trimmed.includes("://")) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Enter a domain");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Enter a domain");
    hostname = url.hostname;
    port = url.port;
  } else {
    const bare = trimmed.replace(/\/.*$/, "").replace(/^\.+|\.+$/g, "");
    const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(bare);
    const withPort = /^([^:[\]]+):(\d+)$/.exec(bare);
    if (bracketed) {
      hostname = bracketed[1];
      port = bracketed[2] ?? "";
    } else if (withPort) {
      hostname = withPort[1];
      port = withPort[2];
    } else {
      hostname = bare;
    }
  }

  hostname = hostname.toLowerCase();
  if (!hostname || /[\s/@\\]/.test(hostname)) throw new Error("Enter a domain");
  const portNumber = port === "" ? 443 : Number(port);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) throw new Error("Enter a domain");
  const literal = hostname.includes(":") ? `[${hostname}]` : hostname;
  return { host: hostname, origin: `https://${literal}:${portNumber}` };
}

function sameSiteHost(originHost: string, nextHost: string) {
  const left = originHost.toLowerCase();
  const right = nextHost.toLowerCase();
  if (left === right) return true;
  const bare = (host: string) => host.startsWith("www.") ? host.slice(4) : host;
  return bare(left) === bare(right);
}

async function readLimitedText(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", truncated: false };
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      if (size + value.byteLength > maxBytes) {
        chunks.push(Buffer.from(value.subarray(0, maxBytes - size)));
        truncated = true;
        break;
      }
      chunks.push(Buffer.from(value));
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { text: new TextDecoder().decode(Buffer.concat(chunks)), truncated };
}

async function fetchSiteFile(
  host: string,
  origin: string,
  path: string,
  limits: { maxHops: number; timeoutMs: number; totalTimeoutMs: number },
) {
  let current = `${origin}${path}`;
  const deadline = performance.now() + limits.totalTimeoutMs;
  for (let hop = 0; hop < limits.maxHops; hop += 1) {
    const remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0) throw new Error("Timed out");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(limits.timeoutMs, remaining));
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "WebTools-Files/0.1", Accept: "text/plain" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (!location) throw new Error("Redirect without a location");
        const next = new URL(location, current);
        if (next.protocol !== "https:" || !sameSiteHost(host, next.hostname)) throw new Error("Redirect left this host");
        current = next.toString();
        continue;
      }
      const type = response.headers.get("content-type") ?? "";
      const limited = await readLimitedText(response, 48_000);
      const html = /html/i.test(type);
      return {
        name: path,
        url: current,
        status: response.status,
        ok: response.ok,
        body: html ? "" : limited.text,
        truncated: html ? false : limited.truncated,
        note: html ? "The response was HTML, not the text file." : undefined,
      };
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Timed out");
      throw error;
    } finally {
      controller.abort();
      clearTimeout(timeout);
    }
  }
  throw new Error("Too many redirects");
}

async function lookupSiteFiles(
  raw: string,
  options: { maxHops?: number; timeoutMs?: number; totalTimeoutMs?: number } = {},
) {
  const target = siteFileTarget(raw);
  const limits = {
    maxHops: options.maxHops ?? 4,
    timeoutMs: options.timeoutMs ?? 8000,
    totalTimeoutMs: options.totalTimeoutMs ?? 32_000,
  };
  const files = await Promise.all(SITE_FILES.map(async (file) => {
    try {
      const result = await fetchSiteFile(target.host, target.origin, file.path, limits);
      return { ...result, name: file.name };
    } catch (error) {
      return {
        name: file.name,
        url: `${target.origin}${file.path}`,
        status: 0,
        ok: false,
        body: "",
        truncated: false,
        error: error instanceof Error ? error.message : "Unreachable",
      };
    }
  }));
  return { host: target.host, files };
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

async function lookupHealthDns(domain: string) {
  const comparison = await compareDnsResolvers(domain, [], { timeoutMs: 2_250 });
  const local = comparison.resolvers[0];
  return {
    a: local.a.records.map((record) => record.address),
    aaaa: local.aaaa.records.map((record) => record.address),
    addressErrors: {
      a: local.a.status === "error" ? local.a.error : undefined,
      aaaa: local.aaaa.status === "error" ? local.aaaa.error : undefined,
    },
  };
}

function normalizeHealthTarget(raw: string) {
  const url = normalizeUrl(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Enter an HTTP or HTTPS URL");
  }
  if (url.username || url.password) throw new Error("URLs with credentials are not supported");
  const domain = normalizeDnsHostname(url.hostname);
  url.hash = "";
  return { domain, url: url.toString() };
}

async function checkDomainHealth(raw: string) {
  const target = normalizeHealthTarget(raw);
  return runDomainHealthChecks(target, {
    status: () => checkStatus(target.url, 5_500),
    dns: () => lookupHealthDns(target.domain),
    tls: () => checkSsl(target.url, 5_500),
    headers: () => traceHeaders(target.url, { maxHops: 4, timeoutMs: 2_500, totalTimeoutMs: 5_500 }),
    mail: () => lookupHealthMail(target.domain),
    siteFiles: () => lookupSiteFiles(target.url, { maxHops: 2, timeoutMs: 2_500, totalTimeoutMs: 5_500 }),
  });
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

    if (url.pathname === "/api/dns-compare" && req.method === "POST") {
      const body = await readJson(req);
      send(res, 200, await compareDnsResolvers(
        String(body.domain ?? body.host ?? ""),
        body.resolvers,
      ));
      return true;
    }

    if (url.pathname === "/api/domain-health" && req.method === "POST") {
      const body = await readJson(req);
      send(res, 200, await checkDomainHealth(String(body.url ?? body.domain ?? body.host ?? "")));
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

    if (url.pathname === "/api/site-files" && req.method === "POST") {
      const body = await readJson(req);
      send(res, 200, await lookupSiteFiles(String(body.domain ?? body.host ?? body.url ?? "")));
      return true;
    }

    send(res, 404, { error: "Not found" });
    return true;
  } catch (error) {
    send(res, 400, { error: error instanceof Error ? error.message : "Request failed" });
    return true;
  }
}
