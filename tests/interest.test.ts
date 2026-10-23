import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLoan, calculateSavings, currencyUnitsDecimal, formatCurrencyUnits, interestCsv,
  interestFrequencies, loanReport, periodsPerYear,
  savingsSchedule, type LoanInput, type SavingsInput,
} from "../src/lib/interest.ts";

const savings: SavingsInput = {
  principal: 1000, annualRate: 5, rateType: "nominal", interestType: "compound",
  compounding: "annually", duration: 2, durationUnit: "years", dayBasis: 365,
  contribution: 0, contributionFrequency: "monthly", contributionTiming: "end",
  annualContributionIncrease: 0, inflationRate: 0, taxRate: 0,
};
const loan: LoanInput = {
  principal: 25000, annualRate: 6.5, duration: 5, durationUnit: "years",
  paymentFrequency: "monthly", extraPayment: 0,
};
function close(actual: number, expected: number, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

test("compound growth matches the CFPB's $1,000 at 5% annual example", () => {
  const result = calculateSavings(savings);
  close(result.balance, 1102.5);
  close(result.interest, 102.5);
  close(result.effectiveAnnualRate, 5);
  close(result.rows.find((row) => row.years === 1)!.balance, 1050);
});

test("all discrete compounding frequencies and continuous compounding match closed-form growth", () => {
  for (const item of interestFrequencies) {
    const result = calculateSavings({ ...savings, compounding: item.value, duration: 2.5 });
    close(result.balance, 1000 * (1 + 0.05 / item.periods) ** (item.periods * 2.5));
    close(result.effectiveAnnualRate, ((1 + 0.05 / item.periods) ** item.periods - 1) * 100);
  }
  close(calculateSavings({ ...savings, compounding: "continuous" }).balance, 1000 * Math.exp(0.1));
});

test("APY is not compounded a second time and fractional terms use the entered effective rate", () => {
  for (const compounding of ["annually", "daily", "continuous"] as const) {
    const result = calculateSavings({ ...savings, rateType: "apy", annualRate: 5.2, duration: 18, durationUnit: "months", compounding });
    close(result.balance, 1000 * 1.052 ** 1.5);
    close(result.effectiveAnnualRate, 5.2);
  }
});

test("simple interest excludes interest from future principal even when contributions are added", () => {
  close(calculateSavings({ ...savings, interestType: "simple" }).balance, 1100);
  for (const contributionTiming of ["beginning", "end"] as const) {
    const result = calculateSavings({ ...savings, interestType: "simple", contribution: 100, duration: 1, contributionTiming });
    const contributionInterest = 100 * 0.05 / 12 * (contributionTiming === "beginning" ? 78 : 66);
    close(result.deposited, 2200);
    close(result.interest, 50 + contributionInterest);
    close(result.balance, 2250 + contributionInterest);
  }
});

test("beginning and end deposits match annuity formulas, including a zero-rate annuity", () => {
  for (const contributionTiming of ["beginning", "end"] as const) {
    const result = calculateSavings({ ...savings, compounding: "monthly", contribution: 100, contributionTiming });
    const rate = 0.05 / 12;
    const factor = (1 + rate) ** 24;
    close(result.balance, 1000 * factor + 100 * (factor - 1) / rate * (contributionTiming === "beginning" ? 1 + rate : 1));
    assert.equal(result.contributionCount, 24);
    const zero = calculateSavings({ ...savings, annualRate: 0, contribution: 100, contributionTiming });
    close(zero.balance, 3400);
    close(zero.interest, 0);
  }
});

test("mixed contribution and compounding schedules match individual deposit growth", () => {
  for (const frequency of interestFrequencies) {
    const years = 1.37;
    const count = Math.floor(years * frequency.periods + 1e-10);
    const result = calculateSavings({ ...savings, compounding: "quarterly", duration: years, contribution: 20, contributionFrequency: frequency.value });
    let expected = 1000 * (1 + 0.05 / 4) ** (4 * years);
    for (let index = 1; index <= count; index++) expected += 20 * (1 + 0.05 / 4) ** (4 * (years - index / frequency.periods));
    close(result.balance, expected);
    assert.equal(result.contributionCount, count);
  }
});

test("contribution increases begin after a full year's contributions, not on the last deposit of year one", () => {
  for (const contributionTiming of ["beginning", "end"] as const) {
    const result = calculateSavings({ ...savings, annualRate: 0, contribution: 100, annualContributionIncrease: 10, contributionTiming });
    close(result.contributions, 12 * 100 + 12 * 110);
  }
  close(calculateSavings({ ...savings, annualRate: 0, contribution: 100, contributionFrequency: "annually", annualContributionIncrease: 10 }).contributions, 210);
});

test("partial periods include only scheduled contributions and preserve the exact maturity time", () => {
  const end = calculateSavings({ ...savings, annualRate: 0, duration: 45, durationUnit: "days", contribution: 100 });
  const beginning = calculateSavings({ ...savings, annualRate: 0, duration: 45, durationUnit: "days", contribution: 100, contributionTiming: "beginning" });
  assert.equal(end.contributionCount, 1);
  assert.equal(beginning.contributionCount, 2);
  close(end.balance, 1100);
  close(beginning.balance, 1200);
  assert.equal(end.rows.at(-1)!.years, 45 / 365);
  assert.equal(beginning.rows[0].deposited, 1100);
  const shorter = calculateSavings({ ...savings, duration: 1, durationUnit: "days" });
  assert.equal(shorter.rows.length, 2);
  close(shorter.rows.at(-1)!.years, 1 / 365);
});

test("365- and 360-day bases affect day terms and daily compounding consistently", () => {
  for (const dayBasis of [365, 360] as const) {
    const simple = calculateSavings({ ...savings, interestType: "simple", duration: 90, durationUnit: "days", dayBasis });
    close(simple.interest, 1000 * 0.05 * 90 / dayBasis);
    const compound = calculateSavings({ ...savings, duration: dayBasis, durationUnit: "days", dayBasis, compounding: "daily" });
    close(compound.balance, 1000 * (1 + 0.05 / dayBasis) ** dayBasis);
    const deposits = calculateSavings({ ...savings, annualRate: 0, duration: dayBasis, durationUnit: "days", dayBasis, contribution: 1, contributionFrequency: "daily" });
    close(deposits.contributions, dayBasis);
  }
});

test("tax is deducted once at maturity and inflation discounts the after-tax balance", () => {
  const result = calculateSavings({ ...savings, interestType: "simple", taxRate: 25, inflationRate: 3 });
  close(result.tax, 25);
  close(result.afterTax, 1075);
  close(result.purchasingPower, 1075 / 1.03 ** 2);
  close(calculateSavings({ ...savings, taxRate: 100 }).afterTax, 1000);
});

test("zero duration keeps only principal, with no beginning deposit or interest", () => {
  const result = calculateSavings({ ...savings, duration: 0, contribution: 100, contributionTiming: "beginning" });
  assert.equal(result.balance, 1000);
  assert.equal(result.contributionCount, 0);
  assert.equal(result.interest, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(calculateSavings({ ...savings, principal: 0 }).balance, 0);
});

test("yearly and monthly reports share the same balances and keep the last partial period", () => {
  const result = calculateSavings({ ...savings, duration: 2.25 });
  const yearly = savingsSchedule(result, "yearly");
  assert.deepEqual(yearly.map((row) => row.years), [0, 1, 2, 2.25]);
  assert.equal(savingsSchedule(result, "monthly").length, 28);
  assert.equal(yearly.at(-1)!.balance, result.balance);
  assert.equal(yearly.at(-1)!.deposited + yearly.at(-1)!.interest, yearly.at(-1)!.balance);
});

test("long savings terms stay bounded and generate monthly reports without daily-sized tables", () => {
  const result = calculateSavings({ ...savings, duration: 100, principal: 0, annualRate: 0, contribution: 1, contributionFrequency: "daily" });
  assert.equal(result.contributionCount, 36500);
  assert.equal(result.rows.length, 1201);
  assert.equal(result.balance, 36500);
});

test("loan payments match a published-style monthly amortization formula and reconcile principal and interest", () => {
  const result = calculateLoan(loan);
  const i = 0.065 / 12;
  const expectedPayment = 25000 * i / (1 - (1 + i) ** -60);
  close(result.scheduledPayment, expectedPayment);
  close(result.totalPaid, expectedPayment * 60);
  assert.equal(result.paymentCount, 60);
  assert.equal(result.rows.at(-1)!.balance, 0);
  close(result.rows.reduce((sum, row) => sum + row.principal, 0), 25000);
  close(result.interest, result.totalPaid - 25000);
  for (const row of result.rows) close(row.payment, row.principal + row.interest);
});

test("zero-rate loans, partial-year terms, and weekly payments do not produce NaN", () => {
  const zero = calculateLoan({ ...loan, principal: 1200, annualRate: 0, duration: 12, durationUnit: "months" });
  close(zero.scheduledPayment, 100);
  assert.equal(zero.paymentCount, 12);
  assert.equal(zero.interest, 0);
  const weekly = calculateLoan({ ...loan, duration: 6, durationUnit: "months", paymentFrequency: "weekly" });
  assert.equal(weekly.paymentCount, 26);
  close(weekly.years, 0.5);
  const tinyRate = calculateLoan({ ...loan, annualRate: 1e-8 });
  close(tinyRate.totalPaid, loan.principal, 1e-8);
  for (const paymentFrequency of ["monthly", "weekly"] as const) {
    const large = calculateLoan({ ...loan, principal: 1e12, annualRate: 0, duration: 100, paymentFrequency });
    assert.equal(large.interest, 0);
    assert.equal(large.totalPaid, large.principal);
  }
});

test("extra loan payments save interest, cap the final payment, and pay principal only once", () => {
  const normal = calculateLoan(loan);
  const extra = calculateLoan({ ...loan, extraPayment: 100 });
  assert.ok(extra.interest < normal.interest);
  assert.ok(extra.paymentCount < normal.paymentCount);
  close(extra.interestSaved, normal.interest - extra.interest);
  assert.equal(extra.periodsSaved, normal.paymentCount - extra.paymentCount);
  assert.ok(extra.rows.at(-1)!.payment <= extra.regularPayment);
  close(extra.rows.reduce((sum, row) => sum + row.principal, 0), loan.principal);
  const immediate = calculateLoan({ ...loan, extraPayment: 1e6 });
  assert.equal(immediate.paymentCount, 1);
  close(immediate.totalPaid, loan.principal * (1 + loan.annualRate / 100 / 12));
});

test("high-rate long loans retain level payments and amortize all principal without a balloon", () => {
  for (const [principal, annualRate, duration, totalPaid] of [
    [100000, 36, 100, 3600000],
    [200000, 130, 30, 7800000],
    [200000, 132, 30, 7920000],
    [100000, 39, 100, 3900000],
    [100000, 1000, 100, 100000000],
  ]) {
    const result = calculateLoan({ ...loan, principal, annualRate, duration });
    assert.equal(result.paymentCount, duration * 12);
    assert.equal(result.rows.at(-1)!.balance, 0);
    assert.ok(Math.abs(result.rows.at(-1)!.payment - result.scheduledPayment) < 0.01);
    close(result.rows.reduce((sum, row) => sum + row.principal, 0), principal, 1e-12);
    close(result.totalPaid, totalPaid, 1e-12);
    for (const row of result.rows) {
      assert.ok(Number.isFinite(row.balance));
      assert.ok(row.principal >= 0 && row.interest >= 0 && row.balance >= 0);
    }
  }
});

test("high-rate extra payments remain stable after exponential growth would overflow", () => {
  for (const extraPayment of [0.01, 100, 1000000]) {
    const result = calculateLoan({ ...loan, principal: 100000, annualRate: 1000, duration: 100, extraPayment });
    assert.ok(result.paymentCount < 1200);
    assert.equal(result.rows.at(-1)!.balance, 0);
    assert.ok(result.rows.at(-1)!.payment <= result.regularPayment);
    close(result.rows.reduce((sum, row) => sum + row.principal, 0), 100000, 1e-12);
    close(result.interest, result.totalPaid - 100000, 1e-12);
    assert.ok(result.interestSaved > 0);
  }
});

test("loan report rows and totals reconcile exactly at zero, two, and three currency decimals", () => {
  for (const input of [
    loan, { ...loan, annualRate: 0 }, { ...loan, extraPayment: 100 },
    { ...loan, principal: 100000, annualRate: 36, duration: 100 },
    { ...loan, principal: 200000, annualRate: 130, duration: 30 },
    { ...loan, principal: 100.005 }, { ...loan, principal: 0.01, duration: 100 },
    { ...loan, principal: 1e12, annualRate: 100, duration: 100 },
  ]) for (const digits of [0, 2, 3]) {
    const result = calculateLoan(input);
    const report = loanReport(result, digits);
    assert.equal(report.rows.reduce((sum, row) => sum + row.principal, 0n), report.principal);
    assert.equal(report.rows.reduce((sum, row) => sum + row.interest, 0n), report.interest);
    assert.equal(report.rows.reduce((sum, row) => sum + row.payment, 0n), report.totalPaid);
    assert.equal(report.totalPaid, report.principal + report.interest);
    assert.equal(report.rows.at(-1)!.balance, 0n);
    let previousBalance = report.principal;
    for (const row of report.rows) {
      assert.equal(row.payment, row.principal + row.interest);
      assert.equal(previousBalance - row.principal, row.balance);
      assert.ok(row.principal >= 0n && row.interest >= 0n && row.balance >= 0n);
      previousBalance = row.balance;
    }
  }
  assert.equal(loanReport(calculateLoan({ ...loan, principal: 100.005 }), 2).principal, 10001n);
});

test("loan table formatting and CSV decimal amounts retain exact minor units above float64 integer precision", () => {
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const jpy = new Intl.NumberFormat("en-US", { style: "currency", currency: "JPY" });
  assert.equal(formatCurrencyUnits(35374n, usd), "$353.74");
  assert.equal(formatCurrencyUnits(13542n, usd), "$135.42");
  assert.equal(formatCurrencyUnits(12345678901234567n, usd), "$123,456,789,012,345.67");
  assert.equal(formatCurrencyUnits(25000n, jpy), "\u00a525,000");
  assert.equal(currencyUnitsDecimal(12345678901234567n, 2), "123456789012345.67");
  assert.equal(currencyUnitsDecimal(25000n, 0), "25000");
  assert.equal(currencyUnitsDecimal(1n, 3), "0.001");
  assert.throws(() => loanReport(calculateLoan(loan), 1.5), /precision/);
});

test("invalid savings inputs and projections outside the monetary range fail clearly", () => {
  for (const [key, value] of [
    ["principal", -1], ["principal", NaN], ["principal", 1e13], ["annualRate", Infinity],
    ["annualRate", -1], ["contribution", -1], ["duration", -1], ["duration", 101],
    ["taxRate", 101], ["inflationRate", -1], ["annualContributionIncrease", 101],
    ["dayBasis", 366], ["compounding", "hourly"], ["rateType", "other"], ["durationUnit", "weeks"],
    ["contributionTiming", "other"], ["interestType", "other"],
  ]) assert.throws(() => calculateSavings({ ...savings, [key]: value }), undefined, String(key));
  assert.throws(() => calculateSavings({ ...savings, annualRate: 1000, duration: 100 }), /too large/);
  assert.throws(() => periodsPerYear("other" as never), /frequency/);
});

test("invalid loan amounts and fractional payment counts are rejected", () => {
  for (const patch of [
    { principal: 0 }, { principal: -1 }, { annualRate: NaN }, { annualRate: -1 },
    { duration: 0 }, { duration: 101 }, { extraPayment: -1 },
    { duration: 1, durationUnit: "months" as const, paymentFrequency: "weekly" as const },
  ]) assert.throws(() => calculateLoan({ ...loan, ...patch }));
});

test("CSV includes every row with CRLF line endings and escapes header quotes", () => {
  assert.equal(interestCsv(['Balance "USD"', "Years"], [[123.45, 1], [150, 2]]),
    '"Balance ""USD""","Years"\r\n"123.45","1"\r\n"150","2"\r\n');
});
