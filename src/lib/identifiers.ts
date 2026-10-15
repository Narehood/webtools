import { v1, v3, v4, v5, v6, v7 } from "uuid";
import { integer, randomInt } from "./utilityCore.ts";

export function generateIdentifiers(
  kind: string,
  count: string,
  name: string,
  namespace: string,
) {
  const size = integer(count, 1, 1000, "Count");
  if (kind === "3" || kind === "5")
    return [(kind === "3" ? v3 : v5)(name, namespace)];
  if (kind === "nano") {
    const alphabet =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from({ length: size }, () =>
      Array.from(
        { length: 12 },
        () => alphabet[randomInt(0, alphabet.length - 1)],
      ).join(""),
    );
  }
  const generator = (
    {
      "1": v1,
      "4": () => v4({ random: crypto.getRandomValues(new Uint8Array(16)) }),
      "6": v6,
      "7": v7,
    } as Record<string, () => string>
  )[kind];
  if (!generator) throw new Error("Choose a supported UUID version.");
  return Array.from({ length: size }, () => generator());
}
export function generateToken(
  length: number,
  lower: boolean,
  upper: boolean,
  digits: boolean,
  symbols: boolean,
) {
  const groups = [
    lower ? "abcdefghijklmnopqrstuvwxyz" : "",
    upper ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "",
    digits ? "0123456789" : "",
    symbols ? "!@#$%^&*_-+=?" : "",
  ].filter(Boolean);
  const alphabet = groups.join("");
  if (!alphabet) throw new Error("Select at least one character group.");
  if (!Number.isInteger(length) || length < 1 || length > 256)
    throw new Error("Use a length from 1 to 256.");
  return Array.from(
    { length },
    () => alphabet[randomInt(0, alphabet.length - 1)],
  ).join("");
}
