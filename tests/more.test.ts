import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { nextCronRuns } from "../src/lib/cron.ts";
import { formatHex, formatHsl, formatRgb, parseColor } from "../src/lib/colorValue.ts";
import { formatZoneTime } from "../src/lib/zones.ts";
import { hmacHex } from "../src/lib/hmac.ts";
import { parseInline, parseMarkdown, safeHref } from "../src/lib/markdown.ts";
import { makePassphrase, passphraseBits } from "../src/lib/passphrase.ts";
import { passphraseWords } from "../src/lib/words.ts";

test("cron lists the next local runs, including day-of-month or weekday", () => {
  const from = new Date(2026, 0, 1, 12, 0, 0);
  const runs = nextCronRuns("0 0 1 * 1", from, 5);
  assert.deepEqual(runs.map((date) => [date.getMonth(), date.getDate(), date.getHours(), date.getDay()]), [
    [0, 5, 0, 1],
    [0, 12, 0, 1],
    [0, 19, 0, 1],
    [0, 26, 0, 1],
    [1, 1, 0, 0],
  ]);
  const quarter = nextCronRuns("*/15 9-17 * * 1-5", new Date(2026, 0, 5, 10, 0, 0), 2);
  assert.equal(quarter[0].getHours(), 10);
  assert.equal(quarter[0].getMinutes(), 15);
  assert.equal(quarter[1].getMinutes(), 30);
});

test("color values convert among hex, rgb, and hsl", () => {
  const red = parseColor("#f00");
  assert.deepEqual(red, { r: 255, g: 0, b: 0 });
  assert.equal(formatHex(red!), "#ff0000");
  assert.equal(formatRgb(red!), "rgb(255, 0, 0)");
  assert.equal(formatHsl(red!), "hsl(0, 100%, 50%)");
  assert.equal(formatHex(parseColor("rgb(30, 165, 76)")!), "#1ea54c");
  assert.equal(parseColor("not a color"), null);
  assert.equal(parseColor("rgb(999, 0, 0)"), null);
});

test("zone formatting accepts UTC and fixed offsets", () => {
  const instant = new Date("2026-01-01T15:00:00Z");
  assert.match(formatZoneTime(instant, "UTC").time, /3:00 PM/);
  assert.match(formatZoneTime(instant, "UTC-5").time, /10:00 AM/);
  assert.equal(formatZoneTime(instant, "UTC-5").label, "UTC-05");
  assert.throws(() => formatZoneTime(instant, "Not/AZone"));
});

test("hmac matches node and markdown keeps unsafe links as text", async () => {
  const expected = createHmac("sha256", "secret").update("message").digest("hex");
  assert.equal(await hmacHex("message", "secret", "SHA-256"), expected);
  await assert.rejects(() => hmacHex("message", "", "SHA-256"));
  const blocks = parseMarkdown("# Title\n\n- **bold** item\n\n[ok](https://example.com)\n[no](javascript:alert(1))\n\n```\ncode\n```");
  assert.equal(blocks[0].type, "h");
  assert.equal(blocks[1].type, "ul");
  assert.equal(blocks[2].type, "p");
  assert.equal(blocks[3].type, "code");
  if (blocks[2].type === "p") {
    assert.equal(blocks[2].inlines.some((part) => part.type === "link"), true);
    assert.equal(blocks[2].inlines.some((part) => part.type === "text" && part.text.includes("javascript:")), true);
  }
  assert.equal(safeHref("javascript:alert(1)"), false);
  assert.equal(parseInline("`code`")[0].type, "code");
});

test("passphrases draw from a unique word list and report entropy", () => {
  assert.equal(new Set(passphraseWords).size, passphraseWords.length);
  assert.equal(passphraseWords.length >= 256, true);
  assert.equal(passphraseBits(6, 256), 48);
  const phrase = makePassphrase(4, "-", ["alpha", "bravo", "charlie", "delta"]);
  assert.equal(phrase.split("-").length, 4);
  for (const word of phrase.split("-")) assert.equal(["alpha", "bravo", "charlie", "delta"].includes(word), true);
});
