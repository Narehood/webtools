import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateBillableHours, calculateTotalHours, clockTimeInput, formatBillableDecimalHours, formatBillingAmount, formatDuration, parseClockTime } from "../src/lib/billing.ts";

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
  for (const [input, minutes] of [["12:00AM", 0], ["12pm", 720], ["1:30 pm", 810], [" 3:10Pm ", 910], ["00:00", 0], ["23:59", 1439], ["9:05", 545], ["1:5PM", 785], ["1:3AM", 63], ["13:5", 785], ["00:5", 5], ["23:5", 1385]] as const) {
    assert.equal(parseClockTime(input), minutes, input);
  }
  for (const input of ["", "13PM", "0AM", "24:00", "1:60PM", "12:99", "1:000PM", "13:60", "00:99", "23:100", "1:30PM junk", "1", "-1:30", "1.5:30"]) {
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

test("total hours accepts decimal hours and totals longer than one day", () => {
  const result = calculateTotalHours("7.5", "25.50", "30");
  assert.equal(result.elapsedMinutes, 450);
  assert.equal(result.breakMinutes, 30);
  assert.equal(result.billableMinutes, 420);
  assert.equal(result.totalCents, 17850n);
  assert.equal(result.nextDay, false);
  assert.equal(formatDuration(result.billableMinutes), "7h 0m");
  assert.equal(calculateTotalHours("40", "50").totalCents, 200000n);
  assert.equal(calculateTotalHours(" .5 ", "50", "").totalCents, 2500n);
  assert.equal(calculateTotalHours("0", "50").totalCents, 0n);
  assert.equal(calculateTotalHours("1.", "50", "60").totalCents, 0n);
});

test("total hours preserves fractions of a minute and rounds only the final pay", () => {
  assert.equal(calculateTotalHours(".01", "50").totalCents, 50n);
  assert.equal(calculateTotalHours(".0001", "50").totalCents, 1n);
  assert.equal(calculateTotalHours(".0001", "49.99").totalCents, 0n);
  assert.equal(calculateTotalHours("1.3333", "19.99", "10").totalCents, 2332n);
  assert.equal(formatDuration(calculateTotalHours("1.01", "50").billableMinutes), "1h 0.6m");
  assert.equal(formatDuration(calculateTotalHours(".3333", "50").billableMinutes), "0h 19.998m");
});

test("total hours rejects invalid hours, rates, and impossible breaks", () => {
  for (const hours of ["", "-1", "NaN", "Infinity", "1e3", "7:30", "7.5h", "1.00001", "9999999999999999"]) {
    assert.throws(() => calculateTotalHours(hours, "50"), /total hours/i, hours);
  }
  for (const rate of ["", "-1", "NaN", "1e3", "25.001"]) {
    assert.throws(() => calculateTotalHours("7.5", rate), /hourly rate/);
  }
  for (const unpaidBreak of ["-1", "1.5", "abc", "451", "Infinity", "99999999999999999999"]) {
    assert.throws(() => calculateTotalHours("7.5", "50", unpaidBreak), /break/i);
  }
  assert.throws(() => calculateTotalHours("0.01", "50", "1"), /break/i);
});

test("24-hour entries work in the default mode while ambiguous hours respect AM/PM", () => {
  for (const [input, minutes] of [["13:30", 810], ["00:30", 30], ["23:15", 1395], ["13:5", 785], ["0:5", 5]] as const) {
    for (const period of ["AM", "PM"] as const) {
      assert.equal(parseClockTime(clockTimeInput(input, period, "12h")), minutes, `${input} with ${period}`);
    }
  }
  assert.equal(parseClockTime(clockTimeInput("1:5", "PM", "12h")), 785);
  assert.equal(parseClockTime(clockTimeInput("1:5", "AM", "12h")), 65);
  assert.equal(parseClockTime(clockTimeInput("09:05", "PM", "12h")), 1265);
  assert.equal(parseClockTime(clockTimeInput("09:05", "PM", "24h")), 545);
  for (const input of ["24:00", "13:60", "0:99", "1:60", "1:100"]) {
    for (const format of ["12h", "24h"] as const) {
      assert.throws(() => parseClockTime(clockTimeInput(input, "PM", format)), undefined, `${input} in ${format}`);
    }
  }
});

test("displayed decimal hours reproduce pay for both cent-rounding review examples", () => {
  const examples = [
    { bill: calculateBillableHours("1:30PM", "3:10PM", "50"), rate: "50", hours: "1.6666", cents: 8333n },
    { bill: calculateTotalHours("1", "25.50", "1"), rate: "25.50", hours: "0.9834", cents: 2508n },
  ];
  for (const { bill, rate, hours, cents } of examples) {
    const displayed = formatBillableDecimalHours(bill);
    assert.deepEqual(displayed, { text: hours, exact: false, reproducesPay: true });
    assert.equal(bill.totalCents, cents);
    assert.equal(calculateTotalHours(displayed.text, rate).totalCents, cents);
  }
});

test("decimal-hour formatting preserves exact values, large durations, and zero rates", () => {
  for (const hours of ["0", "7.5", "0.0001", "1000000000.0001"]) {
    const bill = calculateTotalHours(hours, "50");
    const displayed = formatBillableDecimalHours(bill);
    assert.deepEqual(displayed, { text: hours, exact: true, reproducesPay: true });
    assert.equal(calculateTotalHours(displayed.text, "50").totalCents, bill.totalCents);
  }
  const displayed = formatBillableDecimalHours(calculateBillableHours("9AM", "9:01AM", "0"));
  assert.deepEqual(displayed, { text: "0.0167", exact: false, reproducesPay: true });
});

test("decimal-hour formatting flags rates where four decimal places cannot reproduce pay", () => {
  const bill = calculateBillableHours("9AM", "9:01AM", "300000");
  const displayed = formatBillableDecimalHours(bill);
  assert.deepEqual(displayed, { text: "0.0167", exact: false, reproducesPay: false });
  assert.equal(bill.totalCents, 500000n);
  assert.notEqual(calculateTotalHours(displayed.text, "300000").totalCents, bill.totalCents);
});
