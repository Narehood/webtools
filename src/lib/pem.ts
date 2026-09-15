import "reflect-metadata";
import { sha256 } from "@noble/hashes/sha2.js";
import { Pkcs10CertificateRequest, SubjectAlternativeNameExtension, X509Certificate } from "@peculiar/x509";

export type PemKind = "certificate" | "csr" | "ssh" | "private" | "unknown";

export type PemView = {
  kind: PemKind;
  fields: { label: string; value: string }[];
  warning?: string;
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(":").toUpperCase();
}

function sha256Base64(bytes: Uint8Array) {
  const digest = sha256(bytes);
  let binary = "";
  digest.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/=+$/g, "");
}

function classify(input: string): PemKind {
  const text = input.trim();
  if (/BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY/.test(text) || /BEGIN ENCRYPTED PRIVATE KEY/.test(text)) {
    return "private";
  }
  if (/BEGIN CERTIFICATE REQUEST|BEGIN NEW CERTIFICATE REQUEST/.test(text)) return "csr";
  if (/BEGIN CERTIFICATE/.test(text)) return "certificate";
  if (/^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)\s+/i.test(text)) {
    return "ssh";
  }
  return "unknown";
}

function parseSsh(line: string): PemView {
  const parts = line.trim().split(/\s+/);
  const type = parts[0] ?? "";
  const blob = parts[1] ?? "";
  const comment = parts.slice(2).join(" ");
  const raw = Uint8Array.from(atob(blob), (char) => char.charCodeAt(0));
  const fingerprint = sha256Base64(raw);
  return {
    kind: "ssh",
    fields: [
      { label: "Type", value: type },
      { label: "Comment", value: comment || "—" },
      { label: "SHA256", value: `SHA256:${fingerprint}` },
      { label: "Length", value: `${raw.byteLength} bytes` },
    ],
  };
}

function sanList(cert: X509Certificate) {
  const extension = cert.getExtension(SubjectAlternativeNameExtension);
  if (!extension) return "—";
  try {
    const json = extension.names.toJSON?.() ?? [];
    if (Array.isArray(json) && json.length) {
      return json
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") return Object.values(item).join(" ");
          return String(item);
        })
        .join(", ");
    }
  } catch {
    /* fall through */
  }
  return String(extension.names);
}

export async function inspectKeyMaterial(input: string): Promise<PemView> {
  const text = input.trim();
  if (!text) throw new Error("Paste a certificate, CSR, or SSH public key");
  const kind = classify(text);

  if (kind === "private") {
    return {
      kind,
      fields: [{ label: "Type", value: "Private key" }],
      warning: "This looks like a private key. It stayed in this tab and was not decoded or uploaded.",
    };
  }

  if (kind === "ssh") return parseSsh(text);

  if (kind === "certificate") {
    const cert = new X509Certificate(text);
    const thumb = bytesToHex(sha256(new Uint8Array(cert.rawData)));
    const days = Math.round((cert.notAfter.getTime() - Date.now()) / 86_400_000);
    return {
      kind,
      fields: [
        { label: "Subject", value: cert.subject || "—" },
        { label: "Issuer", value: cert.issuer || "—" },
        { label: "Serial", value: cert.serialNumber || "—" },
        { label: "Valid from", value: cert.notBefore.toISOString() },
        { label: "Valid to", value: cert.notAfter.toISOString() },
        { label: "Days left", value: String(days) },
        { label: "SAN", value: sanList(cert) },
        { label: "SHA-256", value: thumb },
        { label: "Signature", value: `${cert.signatureAlgorithm.name} ${cert.signatureAlgorithm.hash?.name ?? ""}`.trim() },
      ],
    };
  }

  if (kind === "csr") {
    const csr = new Pkcs10CertificateRequest(text);
    return {
      kind,
      fields: [
        { label: "Subject", value: csr.subject || "—" },
        { label: "Signature", value: `${csr.signatureAlgorithm.name} ${csr.signatureAlgorithm.hash?.name ?? ""}`.trim() },
      ],
    };
  }

  throw new Error("Need a PEM certificate, a CSR, or an OpenSSH public key");
}
