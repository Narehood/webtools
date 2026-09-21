export type HmacAlgorithm = "SHA-256" | "SHA-384" | "SHA-512";

export async function hmacHex(message: string, secret: string, algorithm: HmacAlgorithm) {
  if (!secret) throw new Error("Enter a secret");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
