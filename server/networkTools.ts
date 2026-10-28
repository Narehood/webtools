import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";

export type PublicResolverId = "cloudflare" | "google" | "quad9";
export type DnsResolverId = "local" | PublicResolverId;
export type DnsRecordType = "A" | "AAAA";

export type DnsAddressRecord = { address: string; ttl: number };

export type DnsQueryResult = {
  status: "ok" | "absent" | "error";
  records: DnsAddressRecord[];
  error?: string;
};

export type DnsResolverResult = {
  id: DnsResolverId;
  name: string;
  servers: string[];
  a: DnsQueryResult;
  aaaa: DnsQueryResult;
};

export type DnsComparison = {
  domain: string;
  resolvers: DnsResolverResult[];
};

export type DnsResolverDefinition = {
  id: DnsResolverId;
  name: string;
  servers: string[];
};

export type DnsQuery = (
  resolver: DnsResolverDefinition,
  type: DnsRecordType,
  domain: string,
  timeoutMs: number,
) => Promise<DnsAddressRecord[]>;

export const PUBLIC_DNS_RESOLVERS: readonly DnsResolverDefinition[] = [
  { id: "cloudflare", name: "Cloudflare", servers: ["1.1.1.1"] },
  { id: "google", name: "Google", servers: ["8.8.8.8"] },
  { id: "quad9", name: "Quad9", servers: ["9.9.9.9"] },
];

const LOCAL_DNS_RESOLVER: DnsResolverDefinition = {
  id: "local",
  name: "Local resolver",
  servers: [],
};

const PUBLIC_RESOLVER_IDS = new Set(PUBLIC_DNS_RESOLVERS.map((resolver) => resolver.id));
const ABSENT_DNS_CODES = new Set(["ENODATA", "DNS_ENODATA"]);
const DEFAULT_DNS_TIMEOUT_MS = 2_500;

export function normalizeDnsHostname(input: string) {
  if (typeof input !== "string" || !input.trim()) throw new Error("Enter a hostname");
  const trimmed = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
  } catch {
    throw new Error("That does not look like a valid hostname");
  }
  if (parsed.username || parsed.password) throw new Error("Hostnames cannot include credentials");

  const ascii = domainToASCII(parsed.hostname.replace(/\.$/, "")).toLowerCase();
  if (!ascii || ascii.length > 253) throw new Error("That does not look like a valid hostname");
  if (isIP(ascii)) throw new Error("Enter a hostname, not an IP address");
  const labels = ascii.split(".");
  if (labels.some((label) => (
    !label
    || label.length > 63
    || !/^[a-z0-9-]+$/.test(label)
    || label.startsWith("-")
    || label.endsWith("-")
  ))) {
    throw new Error("That does not look like a valid hostname");
  }
  return ascii;
}

export function parsePublicResolverSelection(value: unknown): PublicResolverId[] {
  if (value === undefined) return PUBLIC_DNS_RESOLVERS.map((resolver) => resolver.id as PublicResolverId);
  if (!Array.isArray(value)) throw new Error("resolvers must be an array");
  if (value.length > 12) throw new Error("Too many resolver selections");

  const selected: PublicResolverId[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !PUBLIC_RESOLVER_IDS.has(item as DnsResolverId)) {
      throw new Error("Resolver must be cloudflare, google, or quad9");
    }
    const id = item as PublicResolverId;
    if (!selected.includes(id)) selected.push(id);
  }
  return selected;
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String((error as { code?: unknown }).code ?? "").toUpperCase();
}

function readableDnsError(error: unknown) {
  const code = errorCode(error);
  if (code === "ETIMEOUT" || code === "DNS_ETIMEOUT") return "Timed out";
  if (code === "ECANCELLED" || code === "DNS_ECANCELLED") return "Timed out";
  if (code === "ENOTFOUND" || code === "DNS_ENOTFOUND") return "Hostname was not found";
  if (code === "ESERVFAIL" || code === "DNS_ESERVFAIL") return "Resolver returned a server failure";
  if (code === "EREFUSED" || code === "DNS_EREFUSED") return "Resolver refused the query";
  if (error instanceof Error && error.message) return error.message;
  return "DNS query failed";
}

function validateDnsRecords(records: DnsAddressRecord[]) {
  if (!Array.isArray(records)) throw new Error("Resolver returned an invalid response");
  return records.map((record) => {
    if (
      !record
      || typeof record.address !== "string"
      || !record.address
      || !Number.isInteger(record.ttl)
      || record.ttl < 0
    ) {
      throw new Error("Resolver returned an invalid address record");
    }
    return { address: record.address, ttl: record.ttl };
  });
}

async function queryWithNodeResolver(
  definition: DnsResolverDefinition,
  type: DnsRecordType,
  domain: string,
  timeoutMs: number,
) {
  const resolver = new Resolver({ timeout: timeoutMs, tries: 1, maxTimeout: timeoutMs });
  if (definition.servers.length) resolver.setServers(definition.servers);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = type === "A"
      ? resolver.resolve4(domain, { ttl: true })
      : resolver.resolve6(domain, { ttl: true });
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        resolver.cancel();
        const error = new Error("DNS query timed out") as Error & { code: string };
        error.code = "ETIMEOUT";
        reject(error);
      }, timeoutMs + 250);
    });
    return await Promise.race([query, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
    resolver.cancel();
  }
}

async function settleDnsQuery(
  definition: DnsResolverDefinition,
  type: DnsRecordType,
  domain: string,
  query: DnsQuery,
  timeoutMs: number,
): Promise<DnsQueryResult> {
  try {
    const records = validateDnsRecords(await query(definition, type, domain, timeoutMs));
    return records.length ? { status: "ok", records } : { status: "absent", records: [] };
  } catch (error) {
    if (ABSENT_DNS_CODES.has(errorCode(error))) return { status: "absent", records: [] };
    return { status: "error", records: [], error: readableDnsError(error) };
  }
}

export async function compareDnsResolvers(
  rawDomain: string,
  selection?: unknown,
  options: { query?: DnsQuery; timeoutMs?: number } = {},
): Promise<DnsComparison> {
  const domain = normalizeDnsHostname(rawDomain);
  const selected = parsePublicResolverSelection(selection);
  const definitions = [
    LOCAL_DNS_RESOLVER,
    ...selected.map((id) => PUBLIC_DNS_RESOLVERS.find((resolver) => resolver.id === id)!),
  ];
  const timeoutMs = options.timeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10_000) {
    throw new Error("DNS timeout must be from 100 to 10000 milliseconds");
  }
  const query = options.query ?? queryWithNodeResolver;

  const resolvers = await Promise.all(definitions.map(async (definition): Promise<DnsResolverResult> => {
    const [a, aaaa] = await Promise.all([
      settleDnsQuery(definition, "A", domain, query, timeoutMs),
      settleDnsQuery(definition, "AAAA", domain, query, timeoutMs),
    ]);
    return { ...definition, a, aaaa };
  }));
  return { domain, resolvers };
}

export type DomainHealthState = "ok" | "notice" | "error";

export type DomainHealthCheck = {
  id: "status" | "dns" | "tls" | "headers" | "mail" | "site-files";
  label: string;
  state: DomainHealthState;
  summary: string;
  details: string[];
};

export type DomainHealthTarget = { domain: string; url: string };

export type HealthStatusData = {
  up: boolean;
  status: number;
  statusText: string;
  url: string;
  redirected: boolean;
  ms: number;
  error?: string;
};

export type HealthDnsData = {
  a: string[];
  aaaa: string[];
  addressErrors?: { a?: string; aaaa?: string };
};

export type HealthTlsData = {
  authorized: boolean;
  authorizationError: string | null;
  protocol: string | null;
  daysRemaining: number;
  validTo: string;
};

export type HealthHeadersData = {
  chain: {
    url: string;
    status: number;
    statusText: string;
    location: string | null;
    headers: Record<string, string>;
  }[];
};

export type HealthMailData = {
  mx: { exchange: string; priority: number }[];
  spf: string[];
  dmarc: string[];
  dkim: { selector: string; records: string[] }[];
  lookupErrors?: { mx?: string; txt?: string; dmarc?: string };
};

export type HealthSiteFilesData = {
  files: {
    name: string;
    status: number;
    ok: boolean;
    note?: string;
    error?: string;
  }[];
};

export type DomainHealthDependencies = {
  status: () => Promise<HealthStatusData>;
  dns: () => Promise<HealthDnsData>;
  tls: () => Promise<HealthTlsData>;
  headers: () => Promise<HealthHeadersData>;
  mail: () => Promise<HealthMailData>;
  siteFiles: () => Promise<HealthSiteFilesData>;
};

export type DomainHealthReport = {
  target: DomainHealthTarget;
  checkedAt: string;
  checks: DomainHealthCheck[];
};

function rejectedCheck(
  id: DomainHealthCheck["id"],
  label: string,
  reason: unknown,
): DomainHealthCheck {
  return {
    id,
    label,
    state: "error",
    summary: reason instanceof Error && reason.message ? reason.message : "Check failed",
    details: [],
  };
}

function summarizeStatus(result: PromiseSettledResult<HealthStatusData>): DomainHealthCheck {
  if (result.status === "rejected") return rejectedCheck("status", "Site status", result.reason);
  const value = result.value;
  if (!value.up) {
    return {
      id: "status",
      label: "Site status",
      state: "error",
      summary: value.error || value.statusText || "The site did not respond",
      details: [`Attempted ${value.url}`, `Waited ${value.ms} ms`],
    };
  }
  return {
    id: "status",
    label: "Site status",
    state: value.status >= 400 ? "notice" : "ok",
    summary: `HTTP ${value.status} ${value.statusText || "response"} in ${value.ms} ms`,
    details: [
      `Final URL: ${value.url}`,
      `Redirected: ${value.redirected ? "yes" : "no"}`,
    ],
  };
}

function summarizeDns(result: PromiseSettledResult<HealthDnsData>): DomainHealthCheck {
  if (result.status === "rejected") return rejectedCheck("dns", "DNS addresses", result.reason);
  const { a, aaaa, addressErrors = {} } = result.value;
  const addresses = a.length + aaaa.length;
  const errors = Object.entries(addressErrors).filter((entry): entry is [string, string] => Boolean(entry[1]));
  let state: DomainHealthState = "ok";
  let summary = `${a.length} IPv4 and ${aaaa.length} IPv6 address${addresses === 1 ? "" : "es"} resolved`;
  if (addresses === 0 && errors.length) {
    state = "error";
    summary = "Address lookup failed";
  } else if (addresses === 0) {
    state = "notice";
    summary = "No A or AAAA records were returned";
  } else if (errors.length) {
    state = "notice";
    summary += `; ${errors.length} address lookup failed`;
  }
  return {
    id: "dns",
    label: "DNS addresses",
    state,
    summary,
    details: [
      a.length ? `A: ${a.join(", ")}` : addressErrors.a ? "A: lookup failed" : "A: no record returned",
      aaaa.length ? `AAAA: ${aaaa.join(", ")}` : addressErrors.aaaa ? "AAAA: lookup failed" : "AAAA: no record returned",
      ...errors.map(([type, error]) => `${type.toUpperCase()} lookup: ${error}`),
    ],
  };
}

function summarizeTls(result: PromiseSettledResult<HealthTlsData>): DomainHealthCheck {
  if (result.status === "rejected") return rejectedCheck("tls", "TLS certificate", result.reason);
  const value = result.value;
  const current = value.daysRemaining >= 0;
  const state: DomainHealthState = value.authorized && current ? "ok" : "notice";
  const trust = value.authorized ? "Trusted" : `Not trusted${value.authorizationError ? `: ${value.authorizationError}` : ""}`;
  const validity = current ? `${value.daysRemaining} days remaining` : `expired ${Math.abs(value.daysRemaining)} days ago`;
  return {
    id: "tls",
    label: "TLS certificate",
    state,
    summary: `${trust}; ${validity}`,
    details: [
      `Protocol: ${value.protocol || "not reported"}`,
      `Valid to: ${value.validTo}`,
    ],
  };
}

function summarizeHeaders(result: PromiseSettledResult<HealthHeadersData>): DomainHealthCheck {
  if (result.status === "rejected") return rejectedCheck("headers", "Headers and redirects", result.reason);
  const chain = result.value.chain;
  const last = chain.at(-1);
  if (!last) {
    return { id: "headers", label: "Headers and redirects", state: "notice", summary: "No HTTP response was returned", details: [] };
  }
  const unfinishedRedirect = last.status >= 300 && last.status < 400 && Boolean(last.location);
  return {
    id: "headers",
    label: "Headers and redirects",
    state: last.status >= 400 || unfinishedRedirect ? "notice" : "ok",
    summary: unfinishedRedirect
      ? `Redirect chain did not reach a final response after ${chain.length} hops`
      : `HTTP ${last.status} ${last.statusText || "response"} after ${chain.length} hop${chain.length === 1 ? "" : "s"}`,
    details: [
      `Final URL: ${last.url}`,
      ...(unfinishedRedirect ? [`Next location: ${last.location}`] : []),
      `Strict-Transport-Security: ${last.headers["strict-transport-security"] ? "returned" : "not returned"}`,
      `Content-Security-Policy: ${last.headers["content-security-policy"] ? "returned" : "not returned"}`,
    ],
  };
}

function summarizeMail(result: PromiseSettledResult<HealthMailData>): DomainHealthCheck {
  if (result.status === "rejected") return rejectedCheck("mail", "Mail records", result.reason);
  const value = result.value;
  const errors = Object.entries(value.lookupErrors ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1]));
  const hasRecords = value.mx.length + value.spf.length + value.dmarc.length + value.dkim.length > 0;
  const mxState = value.lookupErrors?.mx ? "lookup failed" : String(value.mx.length);
  const spfState = value.lookupErrors?.txt ? "lookup failed" : value.spf.length ? "returned" : "not returned";
  const dmarcState = value.lookupErrors?.dmarc ? "lookup failed" : value.dmarc.length ? "returned" : "not returned";
  return {
    id: "mail",
    label: "Mail records",
    state: errors.length && !hasRecords ? "error" : errors.length || !value.mx.length || !value.spf.length || !value.dmarc.length ? "notice" : "ok",
    summary: `MX: ${mxState}; SPF: ${spfState}; DMARC: ${dmarcState}`,
    details: [
      `Common DKIM selectors found: ${value.dkim.length}`,
      ...errors.map(([type, error]) => `${type.toUpperCase()} lookup: ${error}`),
    ],
  };
}

function summarizeSiteFiles(result: PromiseSettledResult<HealthSiteFilesData>): DomainHealthCheck {
  if (result.status === "rejected") return rejectedCheck("site-files", "Site files", result.reason);
  const files = result.value.files;
  const found = files.filter((file) => file.ok && !file.note).length;
  const failed = files.filter((file) => Boolean(file.error) || file.status === 0).length;
  const notFound = files.filter((file) => (!file.ok || Boolean(file.note)) && !file.error && file.status > 0).length;
  return {
    id: "site-files",
    label: "Site files",
    state: failed === files.length && files.length > 0 ? "error" : failed ? "notice" : "ok",
    summary: `${found} found; ${notFound} not returned${failed ? `; ${failed} request${failed === 1 ? "" : "s"} failed` : ""}`,
    details: files.map((file) => `${file.name}: ${file.error || file.note || (file.status ? `HTTP ${file.status}` : "no response")}`),
  };
}

export function summarizeDomainHealth(
  target: DomainHealthTarget,
  results: {
    status: PromiseSettledResult<HealthStatusData>;
    dns: PromiseSettledResult<HealthDnsData>;
    tls: PromiseSettledResult<HealthTlsData>;
    headers: PromiseSettledResult<HealthHeadersData>;
    mail: PromiseSettledResult<HealthMailData>;
    siteFiles: PromiseSettledResult<HealthSiteFilesData>;
  },
  checkedAt = new Date().toISOString(),
): DomainHealthReport {
  return {
    target,
    checkedAt,
    checks: [
      summarizeStatus(results.status),
      summarizeDns(results.dns),
      summarizeTls(results.tls),
      summarizeHeaders(results.headers),
      summarizeMail(results.mail),
      summarizeSiteFiles(results.siteFiles),
    ],
  };
}

export async function runDomainHealthChecks(
  target: DomainHealthTarget,
  dependencies: DomainHealthDependencies,
  now: () => string = () => new Date().toISOString(),
): Promise<DomainHealthReport> {
  const [status, dns, tls, headers, mail, siteFiles] = await Promise.allSettled([
    dependencies.status(),
    dependencies.dns(),
    dependencies.tls(),
    dependencies.headers(),
    dependencies.mail(),
    dependencies.siteFiles(),
  ]);
  return summarizeDomainHealth(target, { status, dns, tls, headers, mail, siteFiles }, now());
}
