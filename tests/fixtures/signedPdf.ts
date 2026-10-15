import "reflect-metadata";
import { X509CertificateGenerator } from "@peculiar/x509";
import { PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import * as asn1js from "asn1js";
import {
  Certificate,
  ContentInfo,
  CryptoEngine,
  EncapsulatedContentInfo,
  IssuerAndSerialNumber,
  SignedData,
  SignerInfo,
  setEngine,
} from "pkijs";

export async function signedPdfFixture() {
  setEngine(
    "fixture",
    new CryptoEngine({ name: "fixture", crypto, subtle: crypto.subtle }),
  );
  const algorithm = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
  };
  const keys = await crypto.subtle.generateKey(algorithm, true, [
    "sign",
    "verify",
  ]);
  const certificate = await X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=WebTools test fixture",
    notBefore: new Date("2020-01-01"),
    notAfter: new Date("2040-01-01"),
    signingAlgorithm: algorithm,
    keys,
  });
  const parsed = asn1js.fromBER(certificate.rawData);
  const cert = new Certificate({ schema: parsed.result });
  const document = await PDFDocument.create();
  document.addPage([200, 200]);
  const signature = document.context.obj({
    Type: PDFName.of("Sig"),
    Filter: PDFName.of("Adobe.PPKLite"),
    SubFilter: PDFName.of("adbe.pkcs7.detached"),
    Name: PDFString.of("Test signer"),
    Reason: PDFString.of("Fixture text"),
    ByteRange: [0, 1111111111, 2222222222, 3333333333],
    Contents: PDFHexString.of("0".repeat(16384)),
  });
  document.catalog.set(
    PDFName.of("TestSignature"),
    document.context.register(signature),
  );
  const original = Buffer.from(
    await document.save({ useObjectStreams: false }),
  );
  let text = original.toString("latin1");
  const match = /<0{16384}>/.exec(text)!;
  const first = match.index,
    next = first + match[0].length;
  const placeholder = /\/ByteRange\s*\[[^\]]+\]/.exec(text)!;
  const replacement =
    `/ByteRange [0 ${first} ${next} ${original.length - next}]`.padEnd(
      placeholder[0].length,
      " ",
    );
  text = text.replace(placeholder[0], replacement);
  const bytes = Buffer.from(text, "latin1");
  const signedBytes = new Uint8Array(first + bytes.length - next);
  signedBytes.set(bytes.subarray(0, first));
  signedBytes.set(bytes.subarray(next), first);
  const cms = new SignedData({
    version: 1,
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: "1.2.840.113549.1.7.1",
    }),
    certificates: [cert],
    signerInfos: [
      new SignerInfo({
        version: 1,
        sid: new IssuerAndSerialNumber({
          issuer: cert.issuer,
          serialNumber: cert.serialNumber,
        }),
      }),
    ],
  });
  await cms.sign(keys.privateKey, 0, "SHA-256", signedBytes.buffer);
  const container = new ContentInfo({
    contentType: "1.2.840.113549.1.7.2",
    content: cms.toSchema(true),
  });
  const hex = Buffer.from(container.toSchema().toBER(false)).toString("hex");
  if (hex.length > 16384) throw new Error("Fixture signature is too large.");
  bytes.set(Buffer.from(hex.padEnd(16384, "0"), "ascii"), first + 1);
  return new Uint8Array(bytes);
}
