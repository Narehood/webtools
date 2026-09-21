import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js";

export type HmacAlgorithm = "SHA-256" | "SHA-384" | "SHA-512";

const hashes = {
  "SHA-256": sha256,
  "SHA-384": sha384,
  "SHA-512": sha512,
} as const;

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hmacHex(message: string, secret: string, algorithm: HmacAlgorithm) {
  if (!secret) throw new Error("Enter a secret");
  const encoder = new TextEncoder();
  return hex(hmac(hashes[algorithm], encoder.encode(secret), encoder.encode(message)));
}
