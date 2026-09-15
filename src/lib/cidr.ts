export type CidrResult = {
  version: 4 | 6;
  input: string;
  prefix: number;
  network: string;
  broadcast?: string;
  first: string;
  last: string;
  mask?: string;
  wildcard?: string;
  total: string;
  usable: string;
  contains?: boolean;
  queryIp?: string;
};

function ipv4ToInt(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error("That is not a valid IPv4 address");
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function intToIpv4(value: number) {
  const n = value >>> 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

function expandIpv6(ip: string) {
  const [head, tail] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  if (ip.includes("::")) {
    const missing = 8 - headParts.filter(Boolean).length - tailParts.filter(Boolean).length;
    if (missing < 0) throw new Error("That is not a valid IPv6 address");
    const filled = [...headParts.filter(Boolean), ...Array.from({ length: missing }, () => "0"), ...tailParts.filter(Boolean)];
    if (filled.length !== 8) throw new Error("That is not a valid IPv6 address");
    return filled.map((part) => part.padStart(4, "0"));
  }
  const parts = ip.split(":");
  if (parts.length !== 8) throw new Error("That is not a valid IPv6 address");
  return parts.map((part) => part.padStart(4, "0"));
}

function ipv6ToBig(ip: string) {
  return BigInt(
    `0x${expandIpv6(ip)
      .map((part) => {
        if (!/^[0-9a-fA-F]{1,4}$/.test(part)) throw new Error("That is not a valid IPv6 address");
        return part;
      })
      .join("")}`,
  );
}

function bigToIpv6(value: bigint) {
  const hex = value.toString(16).padStart(32, "0");
  const groups = Array.from({ length: 8 }, (_, index) => hex.slice(index * 4, index * 4 + 4).replace(/^0+(?=\w)/, "") || "0");
  return groups.join(":");
}

function splitCidr(input: string) {
  const trimmed = input.trim();
  const slash = trimmed.lastIndexOf("/");
  if (slash === -1) throw new Error("Use CIDR form, like 192.168.1.0/24");
  return { ip: trimmed.slice(0, slash).trim(), prefix: Number(trimmed.slice(slash + 1).trim()) };
}

export function parseCidr(input: string, queryIp = ""): CidrResult {
  const { ip, prefix } = splitCidr(input);
  if (!Number.isInteger(prefix)) throw new Error("Prefix must be a whole number");

  if (ip.includes(":")) {
    if (prefix < 0 || prefix > 128) throw new Error("IPv6 prefix must be 0–128");
    const addr = ipv6ToBig(ip);
    const bits = 128n - BigInt(prefix);
    const mask = bits === 128n ? 0n : ((1n << BigInt(prefix)) - 1n) << bits;
    const network = addr & mask;
    const last = network | (bits === 0n ? 0n : (1n << bits) - 1n);
    const total = 2n ** bits;
    const check = queryIp.trim();
    let contains: boolean | undefined;
    if (check) {
      try {
        contains = (ipv6ToBig(check) & mask) === network;
      } catch {
        contains = undefined;
      }
    }
    return {
      version: 6,
      input: `${bigToIpv6(network)}/${prefix}`,
      prefix,
      network: bigToIpv6(network),
      first: bigToIpv6(network),
      last: bigToIpv6(last),
      total: total.toString(),
      usable: total.toString(),
      queryIp: check || undefined,
      contains,
    };
  }

  if (prefix < 0 || prefix > 32) throw new Error("IPv4 prefix must be 0–32");
  const addr = ipv4ToInt(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (addr & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);
  const hasHosts = prefix <= 30;
  const first = hasHosts ? network + 1 : network;
  const last = hasHosts ? broadcast - 1 : broadcast;
  const usable = hasHosts ? Math.max(0, last - first + 1) : total;
  const check = queryIp.trim();
  let contains: boolean | undefined;
  if (check) {
    try {
      contains = ((ipv4ToInt(check) & mask) >>> 0) === network;
    } catch {
      contains = undefined;
    }
  }
  return {
    version: 4,
    input: `${intToIpv4(network)}/${prefix}`,
    prefix,
    network: intToIpv4(network),
    broadcast: intToIpv4(broadcast),
    first: intToIpv4(first),
    last: intToIpv4(last),
    mask: intToIpv4(mask),
    wildcard: intToIpv4((~mask) >>> 0),
    total: String(total),
    usable: String(usable),
    queryIp: check || undefined,
    contains,
  };
}
