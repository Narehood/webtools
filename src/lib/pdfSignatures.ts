import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";
import * as asn1js from "asn1js";
import {
  Certificate,
  ContentInfo,
  CryptoEngine,
  SignedData,
  setEngine,
} from "pkijs";
import { bytesToHex } from "@noble/hashes/utils.js";

export type PdfSignatureReport = {
  index: number;
  subFilter: string;
  name: string;
  reason: string;
  signedAt: string;
  integrity: string;
  coversCurrentFile: boolean;
  unsignedBytes: number;
  certificates: {
    subject: string;
    issuer: string;
    notBefore: string;
    notAfter: string;
  }[];
};
function text(dict: PDFDict, key: string) {
  const value = dict.lookup(PDFName.of(key));
  return value instanceof PDFString || value instanceof PDFHexString
    ? value.decodeText()
    : "";
}
export function checkedByteRange(values: number[], fileLength: number) {
  if (
    values.length !== 4 ||
    values.some((value) => !Number.isSafeInteger(value) || value < 0)
  )
    throw new Error("The signature ByteRange is invalid.");
  const [start, length, next, count] = values;
  if (
    start !== 0 ||
    length === 0 ||
    next <= length ||
    next + count > fileLength
  )
    throw new Error(
      "The signature ByteRange overlaps, omits the start, or extends past the file.",
    );
  return { length, next, count, end: next + count };
}
export async function inspectPdfSignatures(bytes: Uint8Array) {
  if (bytes.length > 30 * 1024 * 1024)
    throw new Error("Choose a PDF up to 30 MiB.");
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
    throw new Error("Choose a PDF file.");
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const dictionaries = new Set<PDFDict>();
  for (const [, object] of document.context.enumerateIndirectObjects())
    if (object instanceof PDFDict && object.has(PDFName.of("ByteRange")))
      dictionaries.add(object);
  for (const field of document.getForm().getFields()) {
    const value = field.acroField.dict.lookup(PDFName.of("V"));
    if (value instanceof PDFDict && value.has(PDFName.of("ByteRange")))
      dictionaries.add(value);
  }
  if (dictionaries.size > 30)
    throw new Error(
      "This checker supports up to 30 signature dictionaries per PDF.",
    );
  const reports: PdfSignatureReport[] = [];
  if (crypto.subtle)
    setEngine(
      "WebTools",
      new CryptoEngine({ name: "WebTools", crypto, subtle: crypto.subtle }),
    );
  for (const dict of dictionaries) {
    const subFilter =
      dict.lookup(PDFName.of("SubFilter"))?.toString().replace(/^\//, "") ??
      "Unknown";
    const report: PdfSignatureReport = {
      index: reports.length + 1,
      subFilter,
      name: text(dict, "Name"),
      reason: text(dict, "Reason"),
      signedAt: text(dict, "M"),
      integrity: "Not checked",
      coversCurrentFile: false,
      unsignedBytes: 0,
      certificates: [],
    };
    try {
      const range = dict.lookup(PDFName.of("ByteRange"));
      if (!(range instanceof PDFArray))
        throw new Error("Missing signature ByteRange.");
      const numbers = range.asArray().map((value) => {
        const resolved = document.context.lookup(value);
        if (!(resolved instanceof PDFNumber))
          throw new Error("Non-numeric signature ByteRange.");
        return resolved.asNumber();
      });
      const { length, next, count, end } = checkedByteRange(
        numbers,
        bytes.length,
      );
      report.coversCurrentFile = end === bytes.length;
      report.unsignedBytes = bytes.length - end;
      const contents = dict.lookup(PDFName.of("Contents"));
      if (!(contents instanceof PDFHexString))
        throw new Error(
          "Unsupported signature contents; expected a hexadecimal string.",
        );
      const gap = new TextDecoder("latin1")
        .decode(bytes.subarray(length, next))
        .trim();
      if (
        !/^<[a-f0-9\s]*>$/i.test(gap) ||
        gap.slice(1, -1).replace(/\s/g, "").toLowerCase() !==
          bytesToHex(contents.asBytes())
      )
        throw new Error(
          "The ByteRange gap does not match the signature Contents; integrity is not established.",
        );
      if (!["adbe.pkcs7.detached", "ETSI.CAdES.detached"].includes(subFilter))
        throw new Error(`Unsupported signature format: ${subFilter}.`);
      const der = contents.asBytes();
      const asn = asn1js.fromBER(new Uint8Array(der).buffer);
      if (asn.offset === -1)
        throw new Error("The CMS signature could not be decoded.");
      const cms = new ContentInfo({ schema: asn.result });
      if (cms.contentType !== "1.2.840.113549.1.7.2")
        throw new Error("The contents are not CMS SignedData.");
      const signed = new SignedData({ schema: cms.content });
      report.certificates = (signed.certificates ?? [])
        .filter((cert): cert is Certificate => cert instanceof Certificate)
        .map((cert) => ({
          subject: cert.subject.typesAndValues
            .map(
              (item) => `${item.type}=${String(item.value.valueBlock.value)}`,
            )
            .join(", "),
          issuer: cert.issuer.typesAndValues
            .map(
              (item) => `${item.type}=${String(item.value.valueBlock.value)}`,
            )
            .join(", "),
          notBefore: cert.notBefore.value.toISOString(),
          notAfter: cert.notAfter.value.toISOString(),
        }));
      if (!crypto.subtle)
        throw new Error(
          "Cryptographic verification requires HTTPS or localhost.",
        );
      if (!signed.signerInfos.length || signed.signerInfos.length > 10)
        throw new Error("Unsupported CMS signer count.");
      const data = new Uint8Array(length + count);
      data.set(bytes.subarray(0, length));
      data.set(bytes.subarray(next, end), length);
      const results = [];
      for (let signer = 0; signer < signed.signerInfos.length; signer++)
        results.push(
          await signed.verify({ signer, data: data.buffer, checkChain: false }),
        );
      report.integrity = results.every((value) => value === true)
        ? "Cryptographic signature matches the signed byte ranges."
        : "Signature verification failed: the signed bytes or signature may have changed.";
    } catch (err) {
      report.integrity =
        err instanceof Error ? err.message : "Signature could not be checked.";
    }
    reports.push(report);
  }
  return {
    signatures: reports,
    note: "Certificate chain trust, revocation, timestamps, and signing authority are not validated. A matching signature establishes integrity only for its declared signed revision; inspect unsignedBytes for later changes.",
  };
}
