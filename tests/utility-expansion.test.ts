import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { PDFDocument } from "pdf-lib";
import {
  bcryptAction,
  bip39Action,
  decodeUlid,
  decryptText,
  encryptText,
  makeUlid,
  rsaKeyPair,
} from "../src/lib/cryptoUtilities.ts";
import {
  convertToml,
  formatSql,
  formatYaml,
  xmlAction,
} from "../src/lib/formatUtilities.ts";
import {
  binaryToText,
  codePoints,
  convertList,
  fromRoman,
  maskString,
  normalizeEmailList,
  numeronyms,
  textToBinary,
  toNato,
  toRoman,
  unicodeEscape,
  unicodeUnescape,
} from "../src/lib/textUtilities.ts";
import {
  generateMacs,
  generateUla,
  ipv4Number,
  ipv4Range,
  ipv4Representations,
  normalizeMac,
  randomPorts,
} from "../src/lib/networkUtilities.ts";
import {
  basicAuth,
  decodeBasicAuth,
  decodeSafeLink,
  metaTags,
  svgPlaceholder,
} from "../src/lib/developerUtilities.ts";
import { benchmarkStats, evaluateMath } from "../src/lib/mathEvaluator.ts";
import { base64ToBytes, bytesToBase64 } from "../src/lib/utilityCore.ts";
import {
  checkedByteRange,
  inspectPdfSignatures,
} from "../src/lib/pdfSignatures.ts";
import { convertIntegerBase } from "../src/lib/integerBase.ts";
import { generateIdentifiers, generateToken } from "../src/lib/identifiers.ts";
import { hashAlgorithms, hashText } from "../src/lib/hash.ts";
import { hmacHex } from "../src/lib/hmac.ts";
import { markdownToHtml } from "../src/lib/markdown.ts";
import { verifyTotp } from "../src/lib/totp.ts";
import { convertAll } from "../src/lib/convert.ts";
import { tools } from "../src/data/tools.ts";
import { signedPdfFixture } from "./fixtures/signedPdf.ts";

test("AES messages round-trip UTF-8 and reject wrong passwords, tampering, and unbounded KDF settings", async () => {
  const message = await encryptText(
    "Private text 🌎\nline two",
    "correct horse",
  );
  assert.equal(
    await decryptText(message, "correct horse"),
    "Private text 🌎\nline two",
  );
  await assert.rejects(
    decryptText(message, "wrong horse"),
    /Decryption failed/,
  );
  const data = JSON.parse(message);
  data.ciphertext =
    (data.ciphertext[0] === "A" ? "B" : "A") + data.ciphertext.slice(1);
  await assert.rejects(
    decryptText(JSON.stringify(data), "correct horse"),
    /Decryption failed/,
  );
  data.iterations = Number.MAX_SAFE_INTEGER;
  await assert.rejects(
    decryptText(JSON.stringify(data), "correct horse"),
    /version 1/,
  );
});
test("bcrypt comparison supports a real hash and rejects truncating or excessive-cost input", async () => {
  const hash = await bcryptAction("pässword", "4", "", false);
  assert.match(await bcryptAction("pässword", "4", hash, true), /^Match:/);
  assert.match(await bcryptAction("other", "4", hash, true), /^No match:/);
  await assert.rejects(
    bcryptAction("é".repeat(37), "4", "", false),
    /72 UTF-8/,
  );
  await assert.rejects(bcryptAction("x", "31", "", false), /between 4 and 14/);
});
test("BIP39 entropy and seed match the published English vector", async () => {
  const output = await bip39Action(
    "00".repeat(16),
    "TREZOR",
    "128",
    "From entropy",
  );
  assert.match(
    output,
    /abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about/,
  );
  assert.ok(
    output.includes(
      "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04",
    ),
  );
  await assert.rejects(
    bip39Action("abandon ".repeat(12), "", "128", "Validate"),
    /checksum/,
  );
});
test("ULIDs encode the timestamp and reject overflow and forbidden characters", () => {
  const now = Date.UTC(2026, 9, 15, 12);
  const first = makeUlid(now),
    second = makeUlid(now);
  assert.notEqual(first, second);
  assert.equal(decodeUlid(first), new Date(now).toISOString());
  assert.throws(() => decodeUlid("Z".repeat(26)), /valid/);
  assert.throws(() => decodeUlid("0".repeat(25) + "I"), /valid/);
});
test("RSA exports usable matching PKCS8/SPKI keys", async () => {
  const pair = await rsaKeyPair("2048");
  const decode = (pem: string) =>
    base64ToBytes(pem.replace(/-----[^\n]+-----/g, "").replace(/\s/g, ""))
      .buffer as ArrayBuffer;
  const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    decode(pair.privateKey),
    algorithm,
    false,
    ["sign"],
  );
  const publicKey = await crypto.subtle.importKey(
    "spki",
    decode(pair.publicKey),
    algorithm,
    false,
    ["verify"],
  );
  const message = new TextEncoder().encode("key pair check");
  const signature = await crypto.subtle.sign(algorithm, privateKey, message);
  assert.equal(
    await crypto.subtle.verify(algorithm, publicKey, signature, message),
    true,
  );
});
test("all supported text hash and HMAC algorithms agree with Node crypto", () => {
  for (const algorithm of hashAlgorithms) {
    const nodeName = algorithm
      .toLowerCase()
      .replace("ripemd-", "ripemd")
      .replace(/^sha-(\d)/, "sha$1");
    assert.equal(
      hashText("abc", algorithm),
      createHash(nodeName).update("abc").digest("hex"),
      algorithm,
    );
    assert.equal(
      hmacHex("abc", "secret", algorithm),
      createHmac(nodeName, "secret").update("abc").digest("hex"),
      algorithm,
    );
  }
});
test("UTF-8 binary and Unicode escapes round-trip supplementary characters", () => {
  const text = "A\n café 👋🏽";
  assert.equal(binaryToText(textToBinary(text)), text);
  assert.equal(unicodeUnescape(unicodeEscape(text)), text);
  assert.equal(unicodeUnescape("\\uD83D\\uDE00"), "😀");
  assert.match(codePoints("😀"), /U\+1F600/);
  assert.throws(() => binaryToText("11111111"));
  assert.throws(() => binaryToText("101"));
  assert.throws(() => unicodeUnescape("\\u{110000}"), /10FFFF/);
  assert.equal(toNato("AZ 9"), "Alfa Zulu / 9");
});
test("Roman numerals round-trip every supported integer and reject noncanonical forms", () => {
  for (let value = 1; value <= 3999; value++)
    assert.equal(fromRoman(toRoman(String(value))), String(value));
  for (const value of ["IIII", "IC", "VX", "", "MMMM"])
    assert.throws(() => fromRoman(value));
});
test("list and redaction tools respect Unicode characters and explicit transformations", () => {
  assert.equal(maskString("A😀BCDEF", "2", "2", "*"), "A😀***EF");
  assert.equal(numeronyms("internationalization localization"), "i18n l10n");
  assert.equal(
    convertList(" pear\napple\npear\n", {
      separator: "newline",
      join: "comma",
      trim: "true",
      empty: "true",
      unique: "true",
      sort: "true",
      prefix: "[",
      suffix: "]",
    }),
    "[apple], [pear]",
  );
});
test("email normalization preserves local-part case and limits alias rules to opt-in Gmail domains", () => {
  assert.equal(
    normalizeEmailList(
      "Ada@EXAMPLE.COM\nAda@example.com\nada@example.com",
      false,
      true,
    ),
    "Ada@example.com\nada@example.com",
  );
  assert.equal(
    normalizeEmailList("A.Da+tag@googlemail.com\nada@gmail.com", true, true),
    "ada@gmail.com",
  );
  assert.throws(() => normalizeEmailList("bad@", false, false), /Invalid/);
});
test("positional integer bases round-trip large signed numbers and preserve case above base 36", () => {
  const decimal = "-123456789012345678901234567890";
  for (let base = 2; base <= 64; base++)
    assert.equal(
      convertIntegerBase(convertIntegerBase(decimal, 10, base), base, 10),
      decimal,
    );
  assert.equal(convertIntegerBase("a", 64, 10), "36");
  assert.equal(convertIntegerBase("A", 64, 10), "10");
  assert.equal(convertIntegerBase("0xff", 10, 10), "255");
  assert.equal(convertIntegerBase("+255", 10, 16), "FF");
  assert.throws(() => convertIntegerBase("2", 2, 10));
});
test("UUID versions and random tokens use the requested shape and name-based UUID vectors", () => {
  const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  assert.equal(
    generateIdentifiers("3", "1", "www.example.com", namespace)[0],
    "5df41881-3aed-3515-88a7-2f4a814cf09e",
  );
  assert.equal(
    generateIdentifiers("5", "1", "www.example.com", namespace)[0],
    "2ed6657d-e927-568b-95e1-2665a8aea6a2",
  );
  for (const version of ["1", "4", "6", "7"])
    for (const id of generateIdentifiers(version, "3", "", namespace))
      assert.equal(id[14], version);
  assert.match(generateToken(128, false, false, true, false), /^\d{128}$/);
  assert.throws(() => generateToken(10, false, false, false, false), /Select/);
});
test("TOML/YAML conversions preserve nested data and reject silent data loss", () => {
  const input =
    'title = "WebTools"\n[server]\nports = [80, 443]\nenabled = true';
  const json = convertToml(input, "toml", "json");
  assert.deepEqual(JSON.parse(json), {
    title: "WebTools",
    server: { ports: [80, 443], enabled: true },
  });
  assert.deepEqual(
    JSON.parse(convertToml(convertToml(json, "json", "toml"), "toml", "json")),
    JSON.parse(json),
  );
  assert.deepEqual(parseYaml(formatYaml("a: [1,2]\nb: true")), {
    a: [1, 2],
    b: true,
  });
  assert.throws(
    () => convertToml('{"x":null}', "json", "toml"),
    /cannot represent null/,
  );
  assert.throws(() => convertToml("a: .nan", "yaml", "json"), /nonfinite/);
  assert.throws(() => convertToml("a: &a [*a]", "yaml", "json"), /Circular/);
});
test("XML conversion preserves attributes and string values and rejects DTD and malformed input", () => {
  assert.deepEqual(
    JSON.parse(
      xmlAction(
        '<root id="07"><value>001</value><value>002</value></root>',
        "xml-json",
      ),
    ),
    { root: { value: ["001", "002"], "@_id": "07" } },
  );
  const json = '{"root":{"@_id":"07","value":"001"}}';
  assert.deepEqual(
    JSON.parse(xmlAction(xmlAction(json, "json-xml"), "xml-json")),
    JSON.parse(json),
  );
  assert.ok(
    xmlAction("<p>Hello <b>world</b>!</p>", "format").includes(
      "<p>Hello <b>world</b>!</p>",
    ),
  );
  assert.throws(() => xmlAction("<!DOCTYPE foo><foo/>", "format"), /DTD/);
  assert.throws(() => xmlAction("<a><b></a>", "format"));
  assert.match(
    formatSql("select name from users where id=1", "postgresql"),
    /^SELECT\n/,
  );
});
test("IPv4 conversion is unsigned and CIDR covers exact arbitrary ranges including /0", () => {
  assert.equal(ipv4Number("255.255.255.255"), 4294967295);
  assert.equal(
    ipv4Representations("0xffffffff", "hex").IPv4,
    "255.255.255.255",
  );
  assert.throws(() => ipv4Number("192.168.01.1"));
  assert.deepEqual(ipv4Range("0.0.0.0", "255.255.255.255"), {
    enclosing: "0.0.0.0/0",
    total: 2 ** 32,
    blocks: ["0.0.0.0/0"],
  });
  const result = ipv4Range("192.168.0.1", "192.168.0.254");
  let next = ipv4Number("192.168.0.1");
  for (const block of result.blocks) {
    const [address, prefix] = block.split("/");
    assert.equal(ipv4Number(address), next);
    next += 2 ** (32 - Number(prefix));
  }
  assert.equal(next, ipv4Number("192.168.0.255"));
  assert.throws(() => ipv4Range("1.1.1.2", "1.1.1.1"));
});
test("MAC, ULA, and random-port generators validate bounds and produce unique valid values", () => {
  const macs = generateMacs("", "100", "upper", true).split("\n");
  assert.equal(new Set(macs).size, 100);
  for (const mac of macs) {
    const value = normalizeMac(mac);
    assert.equal(parseInt(value.slice(0, 2), 16) & 3, 2);
  }
  assert.equal(normalizeMac("aabb.ccdd.eeff"), "AABBCCDDEEFF");
  assert.throws(() => normalizeMac("AA-BB:CC-DD-EE-FF"));
  assert.throws(() => generateMacs("00:11:22:33:44", "257", "upper", true));
  assert.match(
    generateUla("a"),
    /Global prefix: fd[0-9a-f]{2}:[0-9a-f]{4}:[0-9a-f]{4}::\/48/,
  );
  assert.deepEqual(randomPorts("1024", "1026", "3").split("\n").sort(), [
    "1024",
    "1025",
    "1026",
  ]);
  assert.throws(() => randomPorts("22", "100", "1"));
});
test("math parsing obeys exponent precedence and never executes JavaScript", () => {
  assert.equal(evaluateMath("-2^2 + 3*4"), 8);
  assert.equal(evaluateMath("2^3^2"), 512);
  assert.ok(
    Math.abs(evaluateMath("sin(pi/2) + sqrt(144) + log(100)") - 15) < 1e-12,
  );
  assert.equal(evaluateMath("max(1,2,3)"), 3);
  for (const expression of [
    "globalThis.alert(1)",
    "constructor(1)",
    "1/0",
    "sqrt(-1)",
    "1 2",
    "pow(2)",
    "sin(1,2)",
  ])
    assert.throws(() => evaluateMath(expression), expression);
  assert.deepEqual(benchmarkStats("1, 2, 3, 4").median, 2.5);
  assert.throws(() => benchmarkStats("1,-2"));
});
test("Base64 files and Basic-auth headers round-trip raw bytes and UTF-8 credentials", () => {
  const bytes = new Uint8Array([0, 128, 255, 13, 10]);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  const large = new Uint8Array(1024 * 1024);
  large[large.length - 1] = 255;
  const decoded = base64ToBytes(bytesToBase64(large));
  assert.equal(decoded.length, large.length);
  assert.equal(decoded[decoded.length - 1], 255);
  assert.throws(() => base64ToBytes("AB=="));
  assert.throws(() => base64ToBytes("not base64!"));
  assert.equal(
    decodeBasicAuth(basicAuth("ada", "sëcret:123")),
    "Username: ada\nPassword: sëcret:123",
  );
  assert.throws(() => basicAuth("a:b", "c"));
});
test("generated markup escapes hostile text and SafeLink decoding checks the exact Microsoft domain", () => {
  const html = metaTags({
    title: "<script>alert(1)</script>",
    description: '" onload="bad',
    url: "https://example.com",
    image: "",
    type: "website",
    site: "Test",
    card: "summary",
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&quot; onload=&quot;bad"));
  const svg = svgPlaceholder("640", "360", "<script>&", "#000000", "#ffffff");
  assert.ok(svg.includes("&lt;script&gt;&amp;"));
  assert.throws(() =>
    svgPlaceholder("640.5", "360", "x", "#000000", "#ffffff"),
  );
  const safe =
    "https://nam01.safelinks.protection.outlook.com/?url=" +
    encodeURIComponent("https://example.com/?a=1&b=2");
  assert.equal(decodeSafeLink(safe), "https://example.com/?a=1&b=2");
  assert.throws(() =>
    decodeSafeLink(safe.replace(".outlook.com/", ".outlook.com.evil.test/")),
  );
  const markdown = markdownToHtml(
    "# Title\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))",
  );
  assert.ok(!markdown.includes("<script>"));
  assert.ok(!markdown.includes('href="javascript:'));
});
test("OTP verification accepts neighboring steps and historic temperature scales agree at boiling water", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(verifyTotp(secret, "287082", 59000), true);
  assert.equal(verifyTotp(secret, "287082", 89000), true);
  assert.equal(verifyTotp(secret, "287082", 119000), false);
  const rows = convertAll("temperature", "c", "100");
  assert.equal(rows.find((row) => row.id === "de")!.value, "0");
  assert.equal(rows.find((row) => row.id === "n")!.value, "33");
  assert.equal(rows.find((row) => row.id === "re")!.value, "80");
  assert.equal(rows.find((row) => row.id === "ro")!.value, "60");
});
test("PDF verification distinguishes signed bytes, tampering, and an unsigned appended revision", async () => {
  const bytes = await signedPdfFixture();
  const report = await inspectPdfSignatures(bytes);
  assert.equal(report.signatures.length, 1);
  assert.match(
    report.signatures[0].integrity,
    /matches the signed byte ranges/,
  );
  assert.equal(report.signatures[0].coversCurrentFile, true);
  const modified = new Uint8Array(bytes);
  const offset = Buffer.from(bytes).indexOf(Buffer.from("Fixture text"));
  assert.ok(offset > 0);
  modified[offset] = 88;
  assert.match(
    (await inspectPdfSignatures(modified)).signatures[0].integrity,
    /verification failed/i,
  );
  const appended = new Uint8Array(
    Buffer.concat([bytes, Buffer.from("\n% unsigned comment\n")]),
  );
  const latest = (await inspectPdfSignatures(appended)).signatures[0];
  assert.equal(latest.coversCurrentFile, false);
  assert.equal(latest.unsignedBytes, 20);
  assert.match(latest.integrity, /matches/);
  const unsigned = await PDFDocument.create();
  unsigned.addPage();
  assert.deepEqual(
    (await inspectPdfSignatures(await unsigned.save())).signatures,
    [],
  );
  assert.throws(() => checkedByteRange([0, 100, 50, 200], 300));
  assert.throws(() => checkedByteRange([1, 100, 200, 100], 300));
});
test("every Frydae catalog entry maps to a registered WebTools page and offline datasets are complete", async () => {
  const comparison = JSON.parse(
    await readFile(
      new URL("../docs/frydae-comparison.json", import.meta.url),
      "utf8",
    ),
  );
  const slugs = new Set(tools.map((tool) => tool.slug));
  assert.equal(slugs.size, tools.length);
  assert.equal(comparison.tools.length, 86);
  for (const tool of comparison.tools)
    assert.ok(
      slugs.has(tool.targetPath.slice(1)),
      `${tool.sourcePath} has no WebTools page`,
    );
  const mac = JSON.parse(
    await readFile(
      new URL("../public/data/mac-vendors.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(Object.keys(mac.entries).length > 40000);
  assert.match(mac.entries["00000C"], /Cisco/i);
  const emoji = JSON.parse(
    await readFile(
      new URL("../public/data/emoji.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(emoji.entries.length > 3000);
});
