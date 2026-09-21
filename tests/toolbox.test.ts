import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { aspectOf, convertBases, decodeHtml, encodeHtml, loremIpsum, percentChange, percentOfAmount, shareOfWhole, textStats, transformEncoded, transformLines } from "../src/lib/toolbox.ts";
import { formatWhoisDate, whoisHighlights, whoisSections } from "../src/lib/whoisView.ts";

test("text stats count words, blank lines, and reading time", () => {
  assert.deepEqual(textStats(""), {
    characters: 0, charactersNoSpaces: 0, words: 0, lines: 0, paragraphs: 0, sentences: 0, reading: "0 min",
  });
  const stats = textStats("One two.\n\nThree.");
  assert.equal(stats.words, 3);
  assert.equal(stats.lines, 3);
  assert.equal(stats.paragraphs, 2);
  assert.equal(stats.sentences, 2);
});

test("number bases honor prefixes and reject bad digits", () => {
  assert.deepEqual(convertBases("0xFF", 10), { bin: "11111111", oct: "377", dec: "255", hex: "FF" });
  assert.deepEqual(convertBases("-0b1000", 10), { bin: "-1000", oct: "-10", dec: "-8", hex: "-8" });
  assert.deepEqual(convertBases("1_000", 10), { bin: "1111101000", oct: "1750", dec: "1000", hex: "3E8" });
  assert.equal("error" in convertBases("12", 2), true);
});

test("html and url transforms round-trip common characters", () => {
  assert.equal(decodeHtml(encodeHtml(`a<b>&"'`)), `a<b>&"'`);
  assert.equal(transformEncoded("a b", "url-encode"), "a%20b");
  assert.equal(transformEncoded("a+b", "url-decode"), "a b");
});

test("lorem and line tools respect the requested shape", () => {
  const text = loremIpsum(2, 2);
  assert.equal(text.startsWith("Lorem ipsum dolor sit amet"), true);
  assert.equal(text.split("\n\n").length, 2);
  assert.equal(transformLines("b\na\n a\n", { trim: true, unique: true, sort: true, reverse: false, numbers: true }), "1. a\n2. b");
});

test("percent and aspect handle zeros and common ratios", () => {
  assert.equal(percentOfAmount(15, 80), 12);
  assert.equal(shareOfWhole(12, 80), 15);
  assert.equal(shareOfWhole(1, 0), null);
  assert.equal(percentChange(40, 50), "+25%");
  assert.equal(percentChange(0, 5), null);
  assert.deepEqual(aspectOf(1920, 1080), { width: 16, height: 9, decimal: 1920 / 1080 });
  assert.equal(aspectOf(0, 10), null);
});

test("whois records become labeled sections with UTC dates", () => {
  const result = {
    "whois.example": {
      "Domain Name": "EXAMPLE.COM",
      Registrar: "Reserved",
      "Creation Date": "1995-08-14T04:00:00Z",
      "Registry Expiry Date": "2025-08-13T04:00:00Z",
      "Name Server": ["A.IANA-SERVERS.NET", "B.IANA-SERVERS.NET"],
      "Domain Status": ["clientDeleteProhibited", "clientTransferProhibited"],
      Registrant: { Organization: "Example Org", Country: "US" },
      text: "Domain Name: EXAMPLE.COM",
    },
  };
  const [section] = whoisSections(result);
  assert.equal(section.rows.find((row) => row.label === "Registrar")?.value, "Reserved");
  assert.equal(section.rows.find((row) => row.label === "Creation Date")?.value, "Aug 14, 1995, 4:00 AM UTC");
  assert.equal(section.rows.find((row) => row.label === "Registrant · Organization")?.value, "Example Org");
  assert.equal(section.raw, "Domain Name: EXAMPLE.COM");
  const highlights = whoisHighlights(result);
  assert.equal(highlights.registrar, "Reserved");
  assert.deepEqual(highlights.nameservers, ["A.IANA-SERVERS.NET", "B.IANA-SERVERS.NET"]);
  assert.equal(highlights.statuses.length, 2);
  assert.equal(formatWhoisDate("2025-08-13T04:00:00Z"), "Aug 13, 2025, 4:00 AM UTC");
  assert.equal(formatWhoisDate("2025-08-13T00:00:00-04:00"), "Aug 13, 2025, 4:00 AM UTC");
});

test("zoneless whois timestamps stay UTC outside UTC", () => {
  const moduleUrl = new URL("../src/lib/whoisView.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--input-type=module",
    "-e",
    `import { formatWhoisDate } from ${JSON.stringify(moduleUrl)};
     const formatted = formatWhoisDate("2025-08-13 04:00:00");
     if (formatted !== "Aug 13, 2025, 4:00 AM UTC") {
       console.error(formatted);
       process.exit(1);
     }`,
  ], {
    env: { ...process.env, TZ: "America/New_York" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
