import { test } from "node:test";
import assert from "node:assert/strict";
import { addDateDays, dateDifference, parseCalendarDate } from "../src/lib/dateMath.ts";

test("date arithmetic handles leap years, centuries and the 0–99 year trap", () => {
  assert.equal(addDateDays("2024-02-28", "1"), "2024-02-29");
  assert.equal(addDateDays("1900-02-28", "1"), "1900-03-01");
  assert.equal(addDateDays("2000-02-28", "1"), "2000-02-29");
  assert.equal(addDateDays("0099-12-31", "1"), "0100-01-01");
  assert.equal(parseCalendarDate("0001-01-01").getUTCFullYear(), 1);
  assert.equal(dateDifference("2024-03-09", "2024-03-11").days, 2);
  assert.equal(dateDifference("2024-11-02", "2024-11-04").days, 2);
});

test("weekday counts have explicit inclusive and reverse semantics", () => {
  assert.deepEqual(dateDifference("2026-09-18", "2026-09-21"), { days: 3, weekdays: 1, weekendDays: 2, elapsedDays: 3 });
  assert.deepEqual(dateDifference("2026-09-21", "2026-09-18", true), { days: -4, weekdays: -2, weekendDays: -2, elapsedDays: -3 });
  assert.equal(dateDifference("2026-09-21", "2026-09-21").weekdays, 0);
  assert.equal(dateDifference("2026-09-21", "2026-09-21", true).weekdays, 1);
  assert.equal(dateDifference("2026-09-19", "2026-09-19", true).weekendDays, 1);
  assert.equal(dateDifference("2026-09-21", "2026-10-05").weekdays, 10);
});

test("adding weekdays works in both directions including weekend starting dates", () => {
  for (const [start, amount, expected] of [
    ["2026-09-18", "1", "2026-09-21"],
    ["2026-09-21", "-1", "2026-09-18"],
    ["2026-09-19", "5", "2026-09-25"],
    ["2026-09-20", "-5", "2026-09-14"],
    ["2026-09-19", "0", "2026-09-19"],
    ["2026-09-21", "10", "2026-10-05"],
  ]) assert.equal(addDateDays(start, amount, true), expected);
});

test("invalid and out-of-range dates never silently roll over", () => {
  for (const input of ["", "2023-02-29", "2026-02-30", "2026-13-01", "0000-01-01", "2026-1-1", "2026-09-22T00:00Z"]) {
    assert.throws(() => parseCalendarDate(input));
  }
  for (const amount of ["", "1.5", "1e3", "Infinity", "999999999999999999"]) assert.throws(() => addDateDays("2026-09-22", amount));
  assert.throws(() => addDateDays("9999-12-31", "1"), /result must/);
  assert.throws(() => addDateDays("0001-01-01", "-1"), /result must/);
});
