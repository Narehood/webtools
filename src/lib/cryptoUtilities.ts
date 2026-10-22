import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  entropyToMnemonic,
  generateMnemonic,
  mnemonicToEntropy,
  mnemonicToSeed,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import bcrypt from "bcryptjs";
import { assertBcryptPassword } from "./bcryptPassword.ts";
import {
  base64ToBytes,
  boundedText,
  bytesToBase64,
  integer,
} from "./utilityCore.ts";

const iterations = 600_000;
export async function encryptText(text: string, password: string) {
  boundedText(text, 200_000);
  if (!password) throw new Error("Enter a password.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await pbkdf2Async(sha256, password, salt, {
    c: iterations,
    dkLen: 32,
  });
  try {
    const ciphertext = gcm(key, nonce).encrypt(new TextEncoder().encode(text));
    return JSON.stringify(
      {
        version: 1,
        algorithm: "AES-256-GCM",
        kdf: "PBKDF2-SHA256",
        iterations,
        salt: bytesToBase64(salt),
        nonce: bytesToBase64(nonce),
        ciphertext: bytesToBase64(ciphertext),
      },
      null,
      2,
    );
  } finally {
    key.fill(0);
  }
}
export async function decryptText(raw: string, password: string) {
  const data = JSON.parse(boundedText(raw, 1_000_000)) as Record<
    string,
    unknown
  >;
  if (
    !data ||
    data.version !== 1 ||
    data.algorithm !== "AES-256-GCM" ||
    data.kdf !== "PBKDF2-SHA256" ||
    data.iterations !== iterations
  )
    throw new Error("Use a version 1 WebTools encrypted message.");
  if (!password) throw new Error("Enter the original password.");
  if (
    [data.salt, data.nonce, data.ciphertext].some(
      (value) => typeof value !== "string",
    )
  )
    throw new Error("Invalid encrypted message.");
  const salt = base64ToBytes(data.salt as string, 16);
  const nonce = base64ToBytes(data.nonce as string, 12);
  const ciphertext = base64ToBytes(data.ciphertext as string, 800_000);
  if (salt.length !== 16 || nonce.length !== 12 || ciphertext.length < 16)
    throw new Error("Invalid encrypted message.");
  const key = await pbkdf2Async(sha256, password, salt, {
    c: iterations,
    dkLen: 32,
  });
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      gcm(key, nonce).decrypt(ciphertext),
    );
  } catch {
    throw new Error(
      "Decryption failed. The password is incorrect or the message was changed.",
    );
  } finally {
    key.fill(0);
  }
}
const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function makeUlid(at = Date.now()) {
  if (!Number.isSafeInteger(at) || at < 0 || at > 0xffffffffffff)
    throw new Error("ULID timestamp is out of range.");
  let number = BigInt(at);
  for (const byte of crypto.getRandomValues(new Uint8Array(10)))
    number = number * 256n + BigInt(byte);
  let output = "";
  for (let i = 0; i < 26; i++) {
    output = crockford[Number(number % 32n)] + output;
    number /= 32n;
  }
  return output;
}
export function decodeUlid(raw: string) {
  const value = raw.trim().toUpperCase();
  if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(value))
    throw new Error("Enter a valid 26-character ULID.");
  let timestamp = 0;
  for (const char of value.slice(0, 10))
    timestamp = timestamp * 32 + crockford.indexOf(char);
  return new Date(timestamp).toISOString();
}
export async function bcryptAction(
  password: string,
  cost: string,
  hash: string,
  compare: boolean,
) {
  assertBcryptPassword(password);
  if (compare) {
    if (
      !/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(hash) ||
      Number(hash.slice(4, 6)) < 4 ||
      Number(hash.slice(4, 6)) > 14
    )
      throw new Error("Use a bcrypt hash with a work factor from 4 to 14.");
    return (await bcrypt.compare(password, hash))
      ? "Match: this password matches the hash."
      : "No match: this password does not match the hash.";
  }
  return bcrypt.hash(password, integer(cost, 4, 14, "Work factor"));
}
export async function bip39Action(
  input: string,
  passphrase: string,
  strength: string,
  action: string,
) {
  boundedText(input, 2000);
  let phrase = input.trim().normalize("NFKD").replace(/\s+/g, " ");
  if (action === "Generate")
    phrase = generateMnemonic(
      wordlist,
      integer(strength, 128, 256, "Strength"),
    );
  else if (action === "From entropy") {
    if (
      !/^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{48}|[a-fA-F0-9]{56}|[a-fA-F0-9]{64})$/.test(
        phrase,
      )
    )
      throw new Error(
        "Entropy must contain 32, 40, 48, 56, or 64 hexadecimal digits.",
      );
    phrase = entropyToMnemonic(hexToBytes(phrase), wordlist);
  }
  if (!validateMnemonic(phrase, wordlist))
    throw new Error("The mnemonic has an invalid word, length, or checksum.");
  const entropy = bytesToHex(mnemonicToEntropy(phrase, wordlist));
  const seed = bytesToHex(await mnemonicToSeed(phrase, passphrase));
  return `Mnemonic (${phrase.split(" ").length} words):\n${phrase}\n\nEntropy (hex):\n${entropy}\n\nSeed (hex, 64 bytes):\n${seed}`;
}
export async function rsaKeyPair(bits: string) {
  if (!crypto.subtle)
    throw new Error(
      "RSA generation requires HTTPS or localhost in this browser.",
    );
  const size = integer(bits, 2048, 4096, "Key size");
  if (![2048, 3072, 4096].includes(size))
    throw new Error("Choose 2048, 3072, or 4096 bits.");
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: size,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  function pem(buffer: ArrayBuffer, label: string) {
    return `-----BEGIN ${label}-----\n${bytesToBase64(new Uint8Array(buffer))
      .match(/.{1,64}/g)!
      .join("\n")}\n-----END ${label}-----`;
  }
  return {
    publicKey: pem(
      await crypto.subtle.exportKey("spki", pair.publicKey),
      "PUBLIC KEY",
    ),
    privateKey: pem(
      await crypto.subtle.exportKey("pkcs8", pair.privateKey),
      "PRIVATE KEY",
    ),
  };
}
