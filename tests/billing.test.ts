import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateBillableHours, formatBillingAmount, formatDuration, parseClockTime } from "../src/lib/billing.ts";

test("billable hours calculates the requested afternoon example from exact minutes", () => {
  const result = calculateBillableHours("1:30PM", "3:10PM", "50");
  assert.equal(result.elapsedMinutes, 100);
  assert.equal(result.billableMinutes, 100);
  assert.equal(result.totalCents, 8333n);
  assert.equal(result.nextDay, false);
  assert.equal(formatDuration(result.billableMinutes), "1h 40m");
  assert.equal(formatBillingAmount(result.totalCents), "$83.33");
});

test("clock inputs support AM/PM, noon, midnight, and 24-hour time", () => {
  for (const [input, minutes] of [["12:00AM", 0], ["12pm", 720], ["1:30 pm", 810], [" 3:10Pm ", 910], ["00:00", 0], ["23:59", 1439], ["9:05", 545]] as const) {
    assert.equal(parseClockTime(input), minutes, input);
  }
  for (const input of ["", "13PM", "0AM", "24:00", "1:60PM", "12:99", "1:3PM", "1:30PM junk", "1", "-1:30", "1.5:30"]) {
    assert.throws(() => parseClockTime(input), undefined, input);
  }
});

test("overnight sessions and unpaid breaks produce the right duration", () => {
  const result = calculateBillableHours("10:30PM", "2:10AM", "25.50", "20");
  assert.equal(result.nextDay, true);
  assert.equal(result.elapsedMinutes, 220);
  assert.equal(result.billableMinutes, 200);
  assert.equal(result.totalCents, 8500n);
  assert.equal(calculateBillableHours("11:30AM", "12:30PM", "25").billableMinutes, 60);
  assert.equal(calculateBillableHours("11:30PM", "12:30AM", "25").billableMinutes, 60);
  assert.equal(calculateBillableHours("9:00", "9:00", "25").totalCents, 0n);
  assert.equal(calculateBillableHours("9:00", "10:00", "25", "60").totalCents, 0n);
});

test("pay rounds final cents without first rounding decimal hours", () => {
  assert.equal(calculateBillableHours("13:30", "15:10", "19.99").totalCents, 3332n);
  assert.equal(calculateBillableHours("9:00", "9:01", ".30").totalCents, 1n);
  assert.equal(calculateBillableHours("9:00", "9:01", ".29").totalCents, 0n);
  assert.equal(calculateBillableHours("9:00", "10:00", "0").totalCents, 0n);
  assert.equal(calculateBillableHours("9:00", "10:00", "25.", "").totalCents, 2500n);
  assert.equal(formatBillingAmount(123456n), "$1,234.56");
});

test("invalid rates and impossible breaks cannot produce a payable total", () => {
  for (const rate of ["", "-1", "NaN", "Infinity", "1e3", "12abc", "25.001"]) {
    assert.throws(() => calculateBillableHours("9AM", "10AM", rate), /hourly rate/);
  }
  for (const unpaidBreak of ["-1", "1.5", "abc", "61", "Infinity", "99999999999999999999"]) {
    assert.throws(() => calculateBillableHours("9AM", "10AM", "25", unpaidBreak), /break/i);
  }
  assert.throws(() => calculateBillableHours("13PM", "2PM", "25"), /Start time/);
  assert.throws(() => calculateBillableHours("1PM", "25:00", "25"), /End time/);
});
