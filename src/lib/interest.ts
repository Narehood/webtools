export const interestFrequencies = [
  { value: "daily", label: "Daily", periods: 365 },
  { value: "weekly", label: "Weekly", periods: 52 },
  { value: "biweekly", label: "Every 2 weeks", periods: 26 },
  { value: "monthly", label: "Monthly", periods: 12 },
  { value: "quarterly", label: "Quarterly", periods: 4 },
  { value: "semiannually", label: "Every 6 months", periods: 2 },
  { value: "annually", label: "Annually", periods: 1 },
] as const;

export type InterestFrequency = (typeof interestFrequencies)[number]["value"];
export type CompoundingFrequency = InterestFrequency | "continuous";
export type DurationUnit = "years" | "months" | "days";
export type SavingsInput = {
  principal: number;
  annualRate: number;
  rateType: "nominal" | "apy";
  interestType: "simple" | "compound";
  compounding: CompoundingFrequency;
  duration: number;
  durationUnit: DurationUnit;
  dayBasis: 365 | 360;
  contribution: number;
  contributionFrequency: InterestFrequency;
  contributionTiming: "beginning" | "end";
  annualContributionIncrease: number;
  inflationRate: number;
  taxRate: number;
};
export type SavingsRow = {
  years: number;
  deposited: number;
  interest: number;
  balance: number;
};
export type SavingsResult = {
  years: number;
  deposited: number;
  contributions: number;
  contributionCount: number;
  interest: number;
  balance: number;
  effectiveAnnualRate: number;
  tax: number;
  afterTax: number;
  purchasingPower: number;
  rows: SavingsRow[];
};
export type LoanInput = {
  principal: number;
  annualRate: number;
  duration: number;
  durationUnit: "years" | "months";
  paymentFrequency: InterestFrequency;
  extraPayment: number;
};
export type LoanRow = {
  period: number;
  years: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  totalPaid: number;
  totalInterest: number;
};
export type LoanResult = {
  principal: number;
  scheduledPayment: number;
  regularPayment: number;
  totalPaid: number;
  interest: number;
  paymentCount: number;
  years: number;
  periodsSaved: number;
  interestSaved: number;
  rows: LoanRow[];
};

const EPSILON = 1e-10;
const MAX_MONEY = 1e15;

function bounded(value: number, label: string, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min.toLocaleString("en-US")} and ${max.toLocaleString("en-US")}.`);
  }
  return value;
}

function money(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_MONEY) {
    throw new Error("The projected amount is too large. Use a smaller amount, rate, or term.");
  }
  return value;
}

export function periodsPerYear(frequency: InterestFrequency, dayBasis = 365) {
  const found = interestFrequencies.find((item) => item.value === frequency);
  if (!found) throw new Error("Choose a supported frequency.");
  return frequency === "daily" ? dayBasis : found.periods;
}

function durationInYears(duration: number, unit: DurationUnit, dayBasis: number) {
  bounded(duration, "Duration", 0, 36500);
  if (!["years", "months", "days"].includes(unit)) throw new Error("Choose a supported duration unit.");
  const years = unit === "months" ? duration / 12 : unit === "days" ? duration / dayBasis : duration;
  return bounded(years, "Term in years", 0, 100);
}

/** Constant-rate projection. Fractional compound periods use equivalent exponential growth. */
export function calculateSavings(input: SavingsInput): SavingsResult {
  bounded(input.principal, "Starting amount", 0, 1e12);
  bounded(input.annualRate, "Annual interest rate (%)", 0, 1000);
  bounded(input.contribution, "Recurring contribution", 0, 1e12);
  bounded(input.annualContributionIncrease, "Annual contribution increase (%)", 0, 100);
  bounded(input.inflationRate, "Inflation rate (%)", 0, 100);
  bounded(input.taxRate, "Tax rate (%)", 0, 100);
  if (input.dayBasis !== 365 && input.dayBasis !== 360) throw new Error("Choose a 365- or 360-day year.");
  if (input.interestType !== "simple" && input.interestType !== "compound") throw new Error("Choose simple or compound interest.");
  if (input.rateType !== "nominal" && input.rateType !== "apy") throw new Error("Choose a nominal rate or APY.");
  if (input.contributionTiming !== "beginning" && input.contributionTiming !== "end") throw new Error("Choose beginning or end contribution timing.");
  const years = durationInYears(input.duration, input.durationUnit, input.dayBasis);
  const rate = input.annualRate / 100;
  const compoundingPeriods = input.compounding === "continuous" ? 0 : periodsPerYear(input.compounding, input.dayBasis);
  const logGrowth = input.rateType === "apy" ? Math.log1p(rate)
    : input.compounding === "continuous" ? rate
      : compoundingPeriods * Math.log1p(rate / compoundingPeriods);
  const contributionPeriods = periodsPerYear(input.contributionFrequency, input.dayBasis);
  const events: { years: number; contribution: number; snapshot: boolean }[] = [];
  const monthCount = Math.ceil(years * 12 - EPSILON);
  for (let month = 1; month <= monthCount; month++) {
    events.push({ years: Math.min(month / 12, years), contribution: 0, snapshot: true });
  }
  if (years > 0 && (events.length === 0 || Math.abs(events.at(-1)!.years - years) > EPSILON)) {
    events.push({ years, contribution: 0, snapshot: true });
  }
  let contributionCount = 0;
  if (input.contribution > 0 && years > 0) {
    const count = input.contributionTiming === "beginning"
      ? Math.ceil(years * contributionPeriods - EPSILON)
      : Math.floor(years * contributionPeriods + EPSILON);
    for (let index = 0; index < count; index++) {
      const time = (index + (input.contributionTiming === "end" ? 1 : 0)) / contributionPeriods;
      // Increase after each full year's worth of contribution periods.
      const increaseYears = Math.floor(index / contributionPeriods + EPSILON);
      const contribution = money(input.contribution * (1 + input.annualContributionIncrease / 100) ** increaseYears);
      events.push({ years: Math.min(time, years), contribution, snapshot: false });
    }
    contributionCount = count;
  }
  events.sort((a, b) => a.years - b.years);
  let balance = input.principal;
  let deposited = input.principal;
  let lastTime = 0;
  const rows: SavingsRow[] = [{ years: 0, balance, deposited, interest: 0 }];
  for (let index = 0; index < events.length;) {
    const time = events[index].years;
    const elapsed = time - lastTime;
    balance = money(balance + (input.interestType === "simple"
      ? deposited * rate * elapsed
      : balance * Math.expm1(logGrowth * elapsed)));
    let snapshot = false;
    while (index < events.length && Math.abs(events[index].years - time) <= EPSILON) {
      const event = events[index++];
      deposited = money(deposited + event.contribution);
      balance = money(balance + event.contribution);
      snapshot ||= event.snapshot;
    }
    // A beginning-of-period deposit belongs to the balance at time zero.
    if (time === 0) rows[0] = { years: 0, balance, deposited, interest: 0 };
    else if (snapshot) rows.push({ years: time, balance, deposited, interest: Math.max(0, balance - deposited) });
    lastTime = time;
  }
  const interest = Math.max(0, balance - deposited);
  const tax = interest * input.taxRate / 100;
  const afterTax = balance - tax;
  return {
    years, deposited, contributions: deposited - input.principal, contributionCount, interest, balance,
    effectiveAnnualRate: input.interestType === "simple" ? rate * 100 : Math.expm1(logGrowth) * 100,
    tax, afterTax, purchasingPower: afterTax / (1 + input.inflationRate / 100) ** years, rows,
  };
}

function amortize(principal: number, rate: number, periods: number, scheduledPayment: number, frequency: number, extraPayment = 0): LoanRow[] {
  const rows: LoanRow[] = [];
  const payment = scheduledPayment + extraPayment;
  const logGrowth = Math.log1p(rate);
  let payoffPeriods = periods;
  if (extraPayment > 0) {
    if (rate === 0) payoffPeriods = Math.min(periods, principal / payment);
    else {
      // payment - principal * rate = extra + scheduledPayment * (1 + rate)^-periods.
      // Sum in log space: neither the tiny principal portion nor a large power is lost.
      const logDiscountedPayment = Math.log(scheduledPayment) - periods * logGrowth;
      const logExtra = Math.log(extraPayment);
      const high = Math.max(logDiscountedPayment, logExtra);
      const logGap = high + Math.log1p(Math.exp(Math.min(logDiscountedPayment, logExtra) - high));
      const logRatio = Math.log(principal) + Math.log(rate) - logGap;
      const logPayoff = logRatio > 0 ? logRatio + Math.log1p(Math.exp(-logRatio)) : Math.log1p(Math.exp(logRatio));
      payoffPeriods = Math.min(periods, logPayoff / logGrowth);
    }
  }
  const count = Math.max(1, Math.ceil(payoffPeriods));
  let balance = principal;
  let totalPaid = 0;
  let totalInterest = 0;
  let interestCorrection = 0;
  for (let period = 1; period <= count; period++) {
    const previousBalance = balance;
    const remaining = Math.max(0, payoffPeriods - period);
    // Present value of remaining payments avoids amplifying float error for long terms.
    balance = period === count ? 0 : Math.min(previousBalance, Math.max(0, rate === 0
      ? payment * remaining : payment * (-Math.expm1(-remaining * logGrowth) / rate)));
    const principalPaid = previousBalance - balance;
    const paid = period === count
      ? Math.max(principalPaid, Math.min(payment, previousBalance * (1 + rate))) : payment;
    const interest = previousBalance * rate;
    // Compensated summation keeps tiny rounding errors from accumulating on long loans.
    const adjustedInterest = interest - interestCorrection;
    const nextInterest = totalInterest + adjustedInterest;
    interestCorrection = (nextInterest - totalInterest) - adjustedInterest;
    totalInterest = money(nextInterest);
    totalPaid = money(principal - balance + totalInterest);
    rows.push({ period, years: period / frequency, payment: paid, principal: principalPaid, interest, balance, totalPaid, totalInterest });
  }
  return rows;
}

/** Fixed-rate, fully amortizing loan with interest rate / payments-per-year each period. */
export function calculateLoan(input: LoanInput): LoanResult {
  bounded(input.principal, "Loan amount", 0.01, 1e12);
  bounded(input.annualRate, "Annual interest rate (%)", 0, 1000);
  bounded(input.extraPayment, "Extra payment", 0, 1e12);
  if (input.durationUnit !== "years" && input.durationUnit !== "months") throw new Error("Choose years or months for the loan term.");
  const years = durationInYears(input.duration, input.durationUnit, 365);
  if (years <= 0) throw new Error("The loan term must be greater than zero.");
  const frequency = periodsPerYear(input.paymentFrequency);
  const rawPeriods = years * frequency;
  const periods = Math.round(rawPeriods);
  if (periods < 1 || Math.abs(rawPeriods - periods) > 1e-7) {
    throw new Error("Choose a term that contains a whole number of payment periods.");
  }
  const rate = input.annualRate / 100 / frequency;
  const scheduledPayment = money(rate === 0 ? input.principal / periods
    : input.principal * rate / -Math.expm1(-periods * Math.log1p(rate)));
  const baseline = amortize(input.principal, rate, periods, scheduledPayment, frequency);
  const rows = input.extraPayment > 0
    ? amortize(input.principal, rate, periods, scheduledPayment, frequency, input.extraPayment)
    : baseline;
  const last = rows.at(-1)!;
  return {
    principal: input.principal,
    scheduledPayment, regularPayment: scheduledPayment + input.extraPayment,
    totalPaid: last.totalPaid, interest: last.totalInterest, paymentCount: rows.length,
    years: last.years, periodsSaved: baseline.length - rows.length,
    interestSaved: Math.max(0, baseline.at(-1)!.totalInterest - last.totalInterest), rows,
  };
}

export type LoanReportRow = {
  period: number;
  years: number;
  payment: bigint;
  principal: bigint;
  interest: bigint;
  balance: bigint;
};

/** Round the decimal representation half up, without losing large integer minor units. */
function currencyUnits(value: number, digits: number): bigint {
  const [mantissa, power = "0"] = value.toString().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const coefficient = BigInt(whole + fraction);
  const exponent = Number(power) - fraction.length + digits;
  if (exponent >= 0) return coefficient * 10n ** BigInt(exponent);
  const divisor = 10n ** BigInt(-exponent);
  return (coefficient + divisor / 2n) / divisor;
}

/** Allocate cumulative rounding across rows; the table and CSV share these exact amounts. */
export function loanReport(result: LoanResult, digits: number) {
  if (!Number.isInteger(digits) || digits < 0 || digits > 3) throw new Error("Currency precision must be between 0 and 3 decimal places.");
  const principal = currencyUnits(result.principal, digits);
  let paidPrincipal = 0n;
  let paidInterest = 0n;
  const rows: LoanReportRow[] = result.rows.map((row, index) => {
    const final = index === result.rows.length - 1;
    const cumulativePrincipal = final ? principal : currencyUnits(Math.max(0, result.principal - row.balance), digits);
    const cumulativeInterest = currencyUnits(row.totalInterest, digits);
    const principalPayment = cumulativePrincipal - paidPrincipal;
    const interestPayment = cumulativeInterest - paidInterest;
    paidPrincipal = cumulativePrincipal;
    paidInterest = cumulativeInterest;
    return {
      period: row.period, years: row.years, principal: principalPayment, interest: interestPayment,
      payment: principalPayment + interestPayment, balance: principal - cumulativePrincipal,
    };
  });
  return {
    principal, rows, scheduledPayment: currencyUnits(result.scheduledPayment, digits),
    regularPayment: currencyUnits(result.regularPayment, digits),
    totalPaid: principal + paidInterest, interest: paidInterest,
    interestSaved: currencyUnits(result.interest + result.interestSaved, digits) - paidInterest,
  };
}

export function currencyUnitsDecimal(value: bigint, digits: number): string {
  const scale = 10n ** BigInt(digits);
  return digits === 0 ? String(value) : `${value / scale}.${(value % scale).toString().padStart(digits, "0")}`;
}

export function formatCurrencyUnits(value: bigint, formatter: Intl.NumberFormat): string {
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  const scale = 10n ** BigInt(digits);
  return formatter.formatToParts(value / scale).map((part) => part.type === "fraction"
    ? (value % scale).toString().padStart(digits, "0") : part.value).join("");
}

/** Reporting only: grouping never changes the underlying projection. */
export function savingsSchedule(result: SavingsResult, grouping: "monthly" | "yearly"): SavingsRow[] {
  if (grouping === "monthly") return result.rows;
  return result.rows.filter((row, index) => index === 0 || index === result.rows.length - 1
    || Math.abs(row.years - Math.round(row.years)) < EPSILON);
}

export function interestCsv(headers: string[], rows: (string | number)[][]): string {
  const cell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
