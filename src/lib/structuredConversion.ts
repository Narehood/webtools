import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { boundedText } from "./utilityCore.ts";
import { parseJsonSafely } from "./safeJson.ts";

function validateRepresentable(value: unknown, format: string, path = "$", ancestors = new Set<object>(), depth = 0): void {
  if (depth > 64) throw new Error("The document is nested too deeply.");
  if (value === null && format === "toml") throw new Error(`TOML cannot represent null at ${path}.`);
  if (typeof value === "number" && format === "json") {
    if (!Number.isFinite(value)) throw new Error(`JSON cannot represent a nonfinite number at ${path}.`);
  }
  if (typeof value === "bigint") {
    if (format === "json" && (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)))
      throw new Error(`JSON cannot represent an integer outside the safe integer range at ${path}; quote it to keep it exact.`);
    if (format === "toml" && (value < -(1n << 63n) || value > (1n << 63n) - 1n))
      throw new Error(`TOML integers must fit in a signed 64-bit integer at ${path}.`);
  }
  if (typeof value === "undefined") throw new Error(`Unsupported value at ${path}.`);
  if (value && typeof value === "object") {
    if (ancestors.has(value)) throw new Error("Circular aliases cannot be converted.");
    ancestors.add(value);
    if (!(value instanceof Date))
      for (const [key, child] of Object.entries(value)) validateRepresentable(child, format, `${path}.${key}`, ancestors, depth + 1);
    ancestors.delete(value);
  }
}

export function convertToml(input: string, from: string, to: string) {
  boundedText(input, 200_000);
  const value = from === "toml" ? parseToml(input, { integersAsBigInt: "asNeeded" }) :
    from === "yaml" ? parseYaml(input, { maxAliasCount: 50, intAsBigInt: true }) : parseJsonSafely(input);
  validateRepresentable(value, to);
  if (to === "toml") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("TOML requires an object at the root.");
    return stringifyToml(value);
  }
  return to === "yaml" ? stringifyYaml(value) :
    JSON.stringify(value, (_, item: unknown) => typeof item === "bigint" ? Number(item) : item, 2);
}
