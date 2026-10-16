import { hmac } from "@noble/hashes/hmac.js";
import { hashFunctions, type HashAlgorithm } from "./hash.ts";

export type HmacAlgorithm = HashAlgorithm;

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hmacHex(message: string, secret: string, algorithm: HmacAlgorithm) {
  if (!secret) throw new Error("Enter a secret");
  const encoder = new TextEncoder();
  if (!Object.hasOwn(hashFunctions,algorithm)) throw new Error("Unsupported HMAC algorithm");
  return hex(hmac(hashFunctions[algorithm], encoder.encode(secret), encoder.encode(message)));
}
