import { md5, ripemd160, sha1 } from "@noble/hashes/legacy.js";
import { sha224, sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import { sha3_224, sha3_256, sha3_384, sha3_512 } from "@noble/hashes/sha3.js";

export const hashFunctions = { "MD5": md5, "SHA-1": sha1, "SHA-224": sha224, "SHA-256": sha256, "SHA-384": sha384, "SHA-512": sha512, "SHA3-224": sha3_224, "SHA3-256": sha3_256, "SHA3-384": sha3_384, "SHA3-512": sha3_512, "RIPEMD-160": ripemd160 } as const;
export type HashAlgorithm = keyof typeof hashFunctions;
export const hashAlgorithms = Object.keys(hashFunctions) as HashAlgorithm[];

function hasher(algorithm: string) {
  if (!Object.hasOwn(hashFunctions,algorithm)) throw new Error("Unsupported hash algorithm");
  return hashFunctions[algorithm as HashAlgorithm].create();
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hashText(text: string, algorithm: string) {
  return hex(hasher(algorithm).update(new TextEncoder().encode(text)).digest());
}

export async function hashFile(file: Blob, algorithm: string, signal?: AbortSignal) {
  const hash = hasher(algorithm);
  const reader = file.stream().getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      hash.update(value);
    }
    return hex(hash.digest());
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    hash.destroy();
  }
}
