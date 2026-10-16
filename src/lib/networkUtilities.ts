import { integer, randomInt } from "./utilityCore.ts";

export function ipv4Number(raw: string) {
  const parts = raw.trim().split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
  )
    throw new Error("Enter a valid dotted IPv4 address without leading zeros.");
  return parts.reduce((value, part) => value * 256 + Number(part), 0);
}
export function dottedIpv4(value: number) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}
export function ipv4Representations(raw: string, format = "dotted") {
  let value: number;
  if (format === "dotted") value = ipv4Number(raw);
  else if (format === "decimal")
    value = integer(raw, 0, 0xffffffff, "IPv4 integer");
  else {
    const text = raw
      .trim()
      .replace(format === "hex" ? /^0x/i : /^0b/i, "")
      .replace(format === "hex" ? /:/g : /[. ]/g, "");
    if (!(format === "hex" ? /^[0-9a-f]{8}$/i : /^[01]{32}$/).test(text))
      throw new Error("Use exactly eight hexadecimal or 32 binary digits.");
    value = parseInt(text, format === "hex" ? 16 : 2);
  }
  return {
    IPv4: dottedIpv4(value),
    Decimal: String(value),
    Hex: `0x${value.toString(16).padStart(8, "0")}`,
    Binary: value.toString(2).padStart(32, "0"),
    "IPv6 mapped": `::ffff:${dottedIpv4(value)}`,
  };
}
export function ipv4Range(start: string, end: string) {
  let first = ipv4Number(start);
  const last = ipv4Number(end);
  if (last < first)
    throw new Error("The last address must be at or after the first.");
  const xor = (first ^ last) >>> 0;
  const prefix = Math.clz32(xor);
  const size = 2 ** (32 - prefix);
  const enclosing = `${dottedIpv4(Math.floor(first / size) * size)}/${prefix}`;
  const total = last - first + 1;
  const blocks: string[] = [];
  while (first <= last) {
    let bits = first === 0 ? 32 : 0;
    if (first !== 0) while (bits < 32 && first % 2 ** (bits + 1) === 0) bits++;
    while (2 ** bits > last - first + 1) bits--;
    blocks.push(`${dottedIpv4(first)}/${32 - bits}`);
    first += 2 ** bits;
  }
  return { enclosing, total, blocks };
}
export function normalizeMac(raw: string) {
  const text = raw.trim();
  if (
    !/^(?:[0-9a-f]{12}|(?:[0-9a-f]{2}:){5}[0-9a-f]{2}|(?:[0-9a-f]{2}-){5}[0-9a-f]{2}|(?:[0-9a-f]{4}\.){2}[0-9a-f]{4})$/i.test(
      text,
    )
  )
    throw new Error("Enter a complete 48-bit MAC address.");
  return text.replace(/[:.\-]/g, "").toUpperCase();
}
export function generateMacs(
  prefix: string,
  count: string,
  style: string,
  local: boolean,
) {
  const cleaned = prefix.trim().replace(/[:\-]/g, "");
  if (!/^(?:[a-f0-9]{2}){0,5}$/i.test(cleaned))
    throw new Error("Use zero to five complete hexadecimal prefix bytes.");
  if (cleaned && parseInt(cleaned.slice(0, 2), 16) & 1)
    throw new Error("Use a unicast prefix (the first byte must be even).");
  const length = integer(count, 1, 1000, "Count");
  const capacity = 256 ** (6 - cleaned.length / 2);
  if (length > capacity)
    throw new Error("This prefix leaves too few unique addresses.");
  const result = new Set<string>();
  while (result.size < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    for (let i = 0; i < cleaned.length / 2; i++)
      bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    if (!cleaned) bytes[0] = local ? (bytes[0] | 2) & 254 : bytes[0] & 254;
    const parts = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    );
    const value =
      style === "dot"
        ? parts.join("").match(/.{4}/g)!.join(".")
        : parts.join(style === "dash" ? "-" : ":");
    result.add(style === "upper" ? value.toUpperCase() : value);
  }
  return [...result].join("\n");
}
export function generateUla(subnet: string) {
  if (!/^[0-9a-f]{1,4}$/i.test(subnet.trim()))
    throw new Error("Subnet ID must be one to four hexadecimal digits.");
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(5)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const prefix = `fd${hex.slice(0, 2)}:${hex.slice(2, 6)}:${hex.slice(6, 10)}`;
  const id = parseInt(subnet, 16).toString(16);
  return `Global prefix: ${prefix}::/48\nSubnet: ${prefix}:${id}::/64\nExample gateway: ${prefix}:${id}::1\n\n40-bit global ID generated with cryptographic randomness (RFC 4193).`;
}
export function randomPorts(min: string, max: string, count: string) {
  const low = integer(min, 1024, 65535, "Minimum port");
  const high = integer(max, low, 65535, "Maximum port");
  const size = integer(count, 1, Math.min(1000, high - low + 1), "Count");
  const ports = new Set<number>();
  while (ports.size < size) ports.add(randomInt(low, high));
  return [...ports].join("\n");
}
