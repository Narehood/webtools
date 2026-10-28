import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export type RedirectGuard = (target: URL, signal: AbortSignal) => Promise<void>;
export class HealthRedirectError extends Error {}

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");

type AddressLookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

/** The explicitly entered target may be on a LAN; only automatic hops use this guard. */
export function createHealthRedirectGuard(
  original: URL,
  resolveAddresses: AddressLookup = (hostname) => lookup(hostname, { all: true }),
): RedirectGuard {
  return async (target, signal) => {
    signal.throwIfAborted();
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password
      || target.hostname !== original.hostname) {
      throw new HealthRedirectError("Domain health redirects must use HTTP(S), no credentials, and the original hostname");
    }
    const hostname = target.hostname.replace(/^\[|\]$/g, "");
    const family = isIP(hostname);
    let abortLookup: () => void = () => {};
    let addresses: { address: string; family: number }[];
    try {
      addresses = family ? [{ address: hostname, family }] : await Promise.race([
        resolveAddresses(hostname),
        new Promise<never>((_, reject) => {
          abortLookup = () => reject(signal.reason);
          signal.addEventListener("abort", abortLookup, { once: true });
        }),
      ]);
    } finally {
      signal.removeEventListener("abort", abortLookup);
    }
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(({ address, family: version }) =>
      blocked.check(address, version === 6 ? "ipv6" : "ipv4"))) {
      throw new HealthRedirectError("Domain health redirects cannot target loopback, unspecified, or link-local addresses");
    }
  };
}

export async function fetchStatusResponse(
  url: URL,
  method: "HEAD" | "GET",
  signal: AbortSignal,
  guard?: RedirectGuard,
) {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(current, {
      method, signal, redirect: guard ? "manual" : "follow",
      headers: { "User-Agent": "WebTools-Status/0.1" },
    });
    const location = response.headers.get("location");
    if (!guard || !location || ![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, url: response.url || current.toString(), redirected: response.redirected || hop > 0 };
    }
    await response.body?.cancel();
    if (hop === 3) throw new HealthRedirectError("Domain health status exceeded the redirect limit");
    const next = new URL(location, current);
    await guard(next, signal);
    current = next;
  }
  throw new HealthRedirectError("Domain health status exceeded the redirect limit");
}
