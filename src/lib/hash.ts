import { sha1 } from "@noble/hashes/legacy.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";

function hasher(algorithm: string) {
  switch (algorithm) {
    case "SHA-1": return sha1.create();
    case "SHA-256": return sha256.create();
    case "SHA-512": return sha512.create();
    default: throw new Error("Unsupported hash algorithm");
  }
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
