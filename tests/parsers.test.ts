import test from "node:test";
import assert from "node:assert/strict";
import { csvToJson, jsonToCsv, casesOf } from "../src/lib/text.ts";
import { explainCron } from "../src/lib/cron.ts";
import { parseCidr } from "../src/lib/cidr.ts";
import { chmodFromOctal, chmodToOctal, chmodToSymbolic } from "../src/lib/chmod.ts";
import { convertAll, formatConverted, parseAmount } from "../src/lib/convert.ts";
import { parseTimestamp } from "../src/lib/timestamp.ts";
import { evaluateRegex } from "../src/lib/regex.ts";

test("CSV round-trips multiline cells, quoted headers, commas, quotes and Unicode", () => {
  const rows = [{ 'last,first': 'Lovelace,Ada', 'note"': 'line one\r\nline "two"', city: '東京' }];
  assert.deepEqual(csvToJson(jsonToCsv(rows)), rows);
  assert.deepEqual(csvToJson('name,note\nAda,"line one\nline two"'), [{ name: "Ada", note: "line one\nline two" }]);
});

test("CSV preserves empty cells and does not silently overwrite duplicate columns", () => {
  assert.deepEqual(csvToJson('value\r\n""\r\n'), [{ value: "" }]);
  assert.deepEqual(csvToJson('a,b\n,'), [{ a: "", b: "" }]);
  assert.deepEqual(csvToJson('a,b\n'), []);
  for (const csv of ['a,a\nx,y', 'a,b\nx,y,z', 'a,b\n"unfinished,x']) assert.throws(() => csvToJson(csv));
  const row = csvToJson('__proto__,constructor\nvalue,other')[0];
  assert.equal(Object.hasOwn(row, "__proto__"), true);
  assert.equal(row.__proto__, "value");
});

test("JSON to CSV aligns heterogeneous rows and serializes nested values", () => {
  assert.deepEqual(csvToJson(jsonToCsv([{ a: 1 }, { b: 2 }, 3])), [
    { a: "1", b: "", value: "" }, { a: "", b: "2", value: "" }, { a: "", b: "", value: "3" },
  ]);
  assert.deepEqual(csvToJson(jsonToCsv([{ nested: { a: 1 } }])), [{ nested: '{"a":1}' }]);
});

test("cron rejects zero/negative steps, invalid ranges and malformed fields", () => {
  for (const cron of ['*/0 * * * *', '*/-1 * * * *', '*/0.1 * * * *', '*/ * * * *', '*/2/3 * * * *', '99 * * * *', '9-1 * * * *', '0 24 * * *', '0 0 0 * *', '0 0 * 13 *', '0 0 * * 8', ', * * * *']) {
    assert.throws(() => explainCron(cron), undefined, cron);
  }
});

test("cron supports Sunday aliases, names, steps and day-field OR semantics", () => {
  assert.equal(explainCron('0 0 * * 0'), explainCron('0 0 * * 7'));
  assert.equal(explainCron('0 0 * * SUN'), explainCron('0 0 * * 7'));
  assert.match(explainCron('*/15 9-17 * JAN MON-FRI'), /minute[s]? 0, 15, 30, 45/);
  assert.match(explainCron('0 0 1 * 1'), /day of the month 1 or Monday/);
  assert.match(explainCron('0 0 */2 * 1'), /and Monday/);
});

test("CIDR rejects empty prefixes and malformed IPv4/IPv6 addresses", () => {
  for (const cidr of ['192.168.1.1/', '192.168..1/24', '192.168.1.256/24', '192.168.01.1/24', '192.168.0.1/0x10', '1.2.3.4/2.5', '2001::1::2/64', '1:2:3:4:5:6:7:8::/64', ':1:2:3:4:5:6:7/64', '2001:::1/64', '1:2:3:4:5:6:7:00000/64']) {
    assert.throws(() => parseCidr(cidr), undefined, cidr);
  }
});

test("CIDR calculates boundary networks and IPv4-mapped IPv6", () => {
  const v4 = parseCidr('192.168.1.10/24', '192.168.1.255');
  assert.equal(v4.network, '192.168.1.0'); assert.equal(v4.last, '192.168.1.254'); assert.equal(v4.contains, true);
  assert.equal(parseCidr('192.168.1.10/31').usable, '2');
  assert.equal(parseCidr('192.168.1.10/32').usable, '1');
  assert.equal(parseCidr('1.2.3.4/0').total, '4294967296');
  assert.equal(parseCidr('::/0').total, '340282366920938463463374607431768211456');
  assert.equal(parseCidr('2001:db8::1/64', '2001:db8::2').contains, true);
  assert.equal(parseCidr('::ffff:192.0.2.1/128').network, '0:0:0:0:0:ffff:c000:201');
});

test("all 4096 chmod modes round-trip, including three-digit leading zeros", () => {
  for (let n = 0; n < 4096; n++) {
    const octal = n.toString(8).padStart(3, '0');
    assert.equal(chmodToOctal(chmodFromOctal(octal)), octal);
  }
  assert.equal(chmodToOctal(chmodFromOctal('0000')), '000');
  assert.equal(chmodToSymbolic(chmodFromOctal('4755')), 'rwsr-xr-x');
  assert.equal(chmodToSymbolic(chmodFromOctal('1700')), 'rwx-----T');
  assert.throws(() => chmodFromOctal('888'));
});

test("case conversion respects camelCase, acronyms, Unicode and long input", () => {
  assert.equal(casesOf('helloWorld').snake, 'hello_world');
  assert.equal(casesOf('HTTPServerURL').kebab, 'http-server-url');
  assert.equal(casesOf('Éclair café').camel, 'eclairCafe');
  assert.equal(casesOf('東京 test').snake, '東京_test');
  assert.equal(casesOf('a'.repeat(150)).snake.length, 150);
  assert.equal(casesOf('hello_world').pascal, 'HelloWorld');
});

test("unit conversion preserves tiny nonzero quantities and grouped decimals", () => {
  assert.equal(convertAll('data', 'bit', '1').find((row) => row.id === 'pb')?.value, '1.25e-16');
  assert.equal(formatConverted(-1e-16), '-1e-16');
  assert.equal(formatConverted(1.0000000000000002), '1');
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('1,234,567.89'), 1234567.89);
  assert.equal(parseAmount('1,5'), 1.5);
  assert.equal(convertAll('temperature', 'f', '32').find((row) => row.id === 'c')?.value, '0');
});

test("timestamp units are explicit and negative/older epochs are supported", () => {
  assert.equal(parseTimestamp('-1', 'seconds').toISOString(), '1969-12-31T23:59:59.000Z');
  assert.equal(parseTimestamp('1000000000000', 'milliseconds').toISOString(), '2001-09-09T01:46:40.000Z');
  assert.equal(parseTimestamp('999999999999', 'milliseconds').toISOString(), '2001-09-09T01:46:39.999Z');
  assert.equal(parseTimestamp('1.5', 'seconds').getTime(), 1500);
  assert.equal(parseTimestamp('2024-01-01T00:00:00Z', 'iso').toISOString(), '2024-01-01T00:00:00.000Z');
  for (const input of ['', '999999999999999999', 'NaN', 'abc']) assert.throws(() => parseTimestamp(input, 'seconds'));
  assert.throws(() => parseTimestamp('-1', 'iso'));
  assert.throws(() => parseTimestamp('2024-02-30T00:00:00Z', 'iso'));
  assert.throws(() => parseTimestamp('2023-02-29', 'iso'));
  assert.equal(parseTimestamp('2024-02-29', 'iso').toISOString(), '2024-02-29T00:00:00.000Z');
});

test("regex collects at most 200 matches and reports invalid syntax", () => {
  const result = evaluateRegex({ pattern: 'a', flags: '', sample: 'a'.repeat(100000) });
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.matches.length, 200); assert.equal(result.truncated, true); }
  assert.equal(evaluateRegex({ pattern: '[', flags: '', sample: 'a' }).ok, false);
  const empty = evaluateRegex({ pattern: '(?:)', flags: 'u', sample: '😀' });
  assert.equal(empty.ok, true);
  if (empty.ok) assert.deepEqual(empty.matches.map((m) => m.index), [0, 2]);
});
