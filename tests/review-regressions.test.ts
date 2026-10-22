import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { htpasswdLine } from "../src/lib/htpasswd.ts";
import { bcryptAction } from "../src/lib/cryptoUtilities.ts";
import { accentInk, contrastRatio } from "../src/lib/contrast.ts";
import { convertData } from "../src/lib/dataConversion.ts";
import { convertToml, formatYaml, xmlAction } from "../src/lib/formatUtilities.ts";
import { formatJson, parseJsonSafely } from "../src/lib/safeJson.ts";
import { diffJsonText } from "../src/lib/jsonDiff.ts";
import { decodeHtml, encodeHtml } from "../src/lib/toolbox.ts";
import { sameSiteHost, siteFileTarget } from "../server/api.ts";

test("htpasswd and bcrypt enforce the same UTF-8 byte boundary", async () => {
  for (const password of ["a".repeat(72), "é".repeat(36), "😀".repeat(18)]) {
    const line = await htpasswdLine("user", password);
    assert.ok(await bcrypt.compare(password, line.slice(5)));
    assert.match(await bcryptAction(password, "4", "", false), /^\$2/);
    for (const run of [() => htpasswdLine("user", password + "a"), () => bcryptAction(password + "a", "4", "", false)])
      await assert.rejects(run, /at most 72 UTF-8 bytes/);
  }
  for (const username of ["bad\nuser", "\ruser", "user\t", "bad:user", "user\0", "user\x7f"])
    await assert.rejects(() => htpasswdLine(username, "password"), /colon or control/);
});

test("JSON consumers reject rounded integers and preserve numeric strings", () => {
  for (const integer of ["9007199254740991", "-9007199254740991"]) {
    const text = `{"id":${integer}}`;
    assert.match(formatJson(text), new RegExp(integer));
    assert.match(convertData(text, "json-yaml"), new RegExp(integer));
    assert.match(convertData(`[${text}]`, "json-csv"), new RegExp(integer));
  }
  for (const integer of ["9007199254740992", "9007199254740993", "-9007199254740993"]) {
    const text = `{"id":${integer}}`;
    for (const run of [() => formatJson(text), () => convertData(text, "json-yaml"), () => convertData(`[${text}]`, "json-csv"),
      () => convertToml(text, "json", "toml"), () => xmlAction(`{"root":${text}}`, "json-xml")])
      assert.throws(run, /safe integer range.*line 1, column/);
    assert.throws(() => diffJsonText(text, '{"id":9007199254740992}'), /Before JSON.*safe integer range/);
  }
  const strings = { id: "9007199254740993", escaped: 'x"9007199254740993' };
  assert.deepEqual(parseJsonSafely(JSON.stringify(strings)), strings);
  assert.throws(() => parseJsonSafely('{\n  "id": 9007199254740993\n}'), /line 2, column 9/);
  assert.throws(() => formatJson('{"value":1e400}'), /Nonfinite/);
  assert.deepEqual(parseJsonSafely('{"fraction":0.1234567890123456789,"zero":-0,"one":1.0}'),
    { fraction: 0.1234567890123456789, zero: -0, one: 1 });
});

test("YAML and TOML keep exact integers or reject incompatible output", () => {
  for (const integer of ["9007199254740992", "9007199254740993", "-9007199254740993", "9223372036854775807", "-9223372036854775808"]) {
    const yaml = `id: ${integer}`;
    assert.equal(formatYaml(yaml).trim(), yaml);
    assert.equal(convertToml(yaml, "yaml", "toml").trim(), `id = ${integer}`);
    assert.equal(convertToml(`id = ${integer}`, "toml", "yaml").trim(), yaml);
    assert.throws(() => convertData(yaml, "yaml-json"), /safe integer range/);
    assert.throws(() => convertToml(`id = ${integer}`, "toml", "json"), /safe integer range/);
  }
  for (const integer of ["9007199254740991", "-9007199254740991"])
    assert.deepEqual(JSON.parse(convertData(`id: ${integer}`, "yaml-json")), { id: Number(integer) });
  for (const value of [".inf", "-.inf", ".nan", "1e400"])
    assert.throws(() => convertData(`value: ${value}`, "yaml-json"), /nonfinite/);
  for (const integer of ["9223372036854775808", "-9223372036854775809"])
    assert.throws(() => convertToml(`id: ${integer}`, "yaml", "toml"), /signed 64-bit/);
  assert.throws(() => convertData("a: &a [*a]", "yaml-json"), /Circular/);
  assert.throws(() => convertData("a".repeat(200001), "yaml-json"), /200,000|200000/);
});

test("scientific and fractional numeric literals retain standard floating-point behavior", () => {
  for (const token of ["6.022e23", "1e300", "9.007199254740993e15", "9007199254740993.0", "0.12345678901234567890"]) {
    const text = `{"value":${token}}`;
    assert.deepEqual(JSON.parse(formatJson(text)), JSON.parse(text));
    assert.equal(JSON.parse(convertData(`value: ${token}`, "yaml-json")).value, Number(token));
  }
  assert.equal(JSON.parse(convertData("value: 1.0e+30", "yaml-json")).value, 1e30);
  assert.equal(JSON.parse(convertToml("value = 1e30", "toml", "json")).value, 1e30);
  assert.equal(JSON.parse(convertToml("value = 9007199254740993.0", "toml", "json")).value, Number("9007199254740993.0"));
  assert.throws(() => formatJson('[1e400]'), /Nonfinite/);
});

test("accent button text meets 4.5:1 for presets and difficult custom colors", () => {
  for (const color of ["#1ea54c", "#0f766e", "#0369a1", "#6d28d9", "#b45309", "#be123c",
    "#777777", "#808080", "#f97316", "#ff0000", "#ffff00", "#000000", "#ffffff"])
    assert.ok(contrastRatio(color, accentInk(color)) >= 4.5, color);
  assert.equal(accentInk("#1ea54c"), "#1a1612");
});

test("site-file IPv6 targets and redirect comparisons normalize brackets", () => {
  for (const raw of ["::1", "[::1]", "https://[::1]", "https://[::1]:443"])
    assert.deepEqual(siteFileTarget(raw), { host: "::1", origin: "https://[::1]:443" });
  for (const raw of ["[2001:DB8::1]:8443", "https://[2001:DB8::1]:8443"])
    assert.deepEqual(siteFileTarget(raw), { host: "2001:db8::1", origin: "https://[2001:db8::1]:8443" });
  assert.throws(() => siteFileTarget("a:b:c"), /IPv6/);
  assert.equal(sameSiteHost("::1", "[::1]"), true);
  assert.equal(sameSiteHost("2001:db8::1", "[2001:0DB8:0:0:0:0:0:1]"), true);
  assert.equal(sameSiteHost("::1", "[::2]"), false);
  assert.equal(sameSiteHost("example.com", "www.example.com"), true);
});

test("HTML references decode once and invalid code points become replacement characters", () => {
  assert.equal(decodeHtml("&#38;lt; &#x26;lt; &#38;#x3c; &amp;lt;"), "&lt; &lt; &#x3c; &lt;");
  assert.equal(decodeHtml("&amp;&lt;&gt;&quot;&apos; &#60; &#x3C; &#X1f600;"), '&<>"\' < < 😀');
  const text = 'Literal &#38; and &lt; with <tag> "quotes"';
  assert.equal(decodeHtml(encodeHtml(text)), text);
  assert.equal(decodeHtml("&nbsp; &#60 &LT;"), "&nbsp; &#60 &LT;");
  assert.equal(decodeHtml("&#0;&#xD800;&#1114112;&#999999999999999999999;"), "\ufffd\ufffd\ufffd\ufffd");
});
