import { useId, useMemo, useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import { saveFile, ToolFrame } from "../../components/Utility";
import {
  calculateLoan, calculateSavings, interestCsv, interestFrequencies, savingsSchedule,
  type CompoundingFrequency, type DurationUnit, type InterestFrequency, type LoanInput,
  type LoanResult, type SavingsInput, type SavingsResult,
} from "../../lib/interest";
import "./interest.css";

type Mode = "compound" | "simple" | "loan";
type SavingsFields = {
  principal: string; annualRate: string; rateType: "nominal" | "apy";
  compounding: CompoundingFrequency; duration: string; durationUnit: DurationUnit;
  dayBasis: "365" | "360"; contribution: string; contributionFrequency: InterestFrequency;
  contributionTiming: "beginning" | "end"; annualContributionIncrease: string;
  inflationRate: string; taxRate: string;
};
type LoanFields = {
  principal: string; annualRate: string; duration: string; durationUnit: "years" | "months";
  paymentFrequency: InterestFrequency; extraPayment: string;
};
const defaultSavings: SavingsFields = {
  principal: "10000", annualRate: "5", rateType: "nominal", compounding: "monthly",
  duration: "10", durationUnit: "years", dayBasis: "365", contribution: "200",
  contributionFrequency: "monthly", contributionTiming: "end", annualContributionIncrease: "0",
  inflationRate: "0", taxRate: "0",
};
const defaultLoan: LoanFields = {
  principal: "25000", annualRate: "6.5", duration: "5", durationUnit: "years",
  paymentFrequency: "monthly", extraPayment: "0",
};
const currencies = [
  ["USD", "USD — US dollar"], ["EUR", "EUR — Euro"], ["GBP", "GBP — British pound"],
  ["CAD", "CAD — Canadian dollar"], ["AUD", "AUD — Australian dollar"],
  ["JPY", "JPY — Japanese yen"], ["INR", "INR — Indian rupee"], ["CHF", "CHF — Swiss franc"],
] as const;

function numberInput(value: string, label: string) {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`Enter a valid number for ${label}.`);
  return Number(value);
}

function NumberField({ label, value, onChange, min = 0, max, hint }: {
  label: string; value: string; onChange: (value: string) => void; min?: number; max?: number; hint?: string;
}) {
  const id = useId();
  return <label className="field">
    <span id={`${id}-label`}>{label}</span>
    <input type="number" inputMode="decimal" step="any" min={min} max={max} value={value}
      aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined}
      onChange={(event) => onChange(event.target.value)} />
    {hint && <small id={`${id}-hint`} className="interest-hint">{hint}</small>}
  </label>;
}

function ProjectionChart({ points, money, loan = false }: {
  points: { years: number; primary: number; secondary: number }[];
  money: (value: number) => string; loan?: boolean;
}) {
  const width = 620, height = 250, left = 96, right = 12, top = 16, bottom = 34;
  const maxYears = Math.max(points.at(-1)?.years ?? 0, 1 / 365);
  const maxValue = Math.max(...points.flatMap((p) => [p.primary, p.secondary]), 1);
  const x = (years: number) => left + years / maxYears * (width - left - right);
  const y = (value: number) => top + (1 - value / maxValue) * (height - top - bottom);
  const line = (key: "primary" | "secondary") => points.map((point) => `${x(point.years)},${y(point[key])}`).join(" ");
  const path = line("primary");
  return <figure className="interest-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={loan
      ? "Loan balance and cumulative interest over time. Exact values are in the repayment schedule."
      : "Total balance and money deposited over time. Exact values are in the growth schedule."}>
      {[0, 0.5, 1].map((fraction) => <g key={fraction}>
        <line x1={left} x2={width - right} y1={y(maxValue * fraction)} y2={y(maxValue * fraction)} className="interest-gridline" />
        <text x={left - 10} y={y(maxValue * fraction) + 4} textAnchor="end">{money(maxValue * fraction)}</text>
      </g>)}
      <polygon points={`${x(0)},${y(0)} ${path} ${x(points.at(-1)?.years ?? 0)},${y(0)}`} className="interest-chart-area" />
      <polyline points={line("secondary")} className="interest-chart-secondary" />
      <polyline points={path} className="interest-chart-primary" />
      {[0, 0.5, 1].map((fraction) => <text key={fraction} x={x(maxYears * fraction)} y={height - 8}
        textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}>
        {Number((maxYears * fraction).toFixed(2))} yr
      </text>)}
    </svg>
    <figcaption><span><i className="interest-key primary" />{loan ? "Remaining balance" : "Total balance"}</span>
      <span><i className="interest-key secondary" />{loan ? "Interest paid" : "Money deposited"}</span></figcaption>
  </figure>;
}

export function InterestCalculatorTool() {
  const [mode, setMode] = useState<Mode>("compound");
  const [currency, setCurrency] = useState("USD");
  const [savings, setSavings] = useState(defaultSavings);
  const [loan, setLoan] = useState(defaultLoan);
  const [contributionsEnabled, setContributionsEnabled] = useState(true);
  const [adjustmentsEnabled, setAdjustmentsEnabled] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [comparisonRate, setComparisonRate] = useState("6");
  const [grouping, setGrouping] = useState<"monthly" | "yearly">("yearly");
  const [page, setPage] = useState(0);
  const moneyFormatter = useMemo(() => new Intl.NumberFormat("en-US", { style: "currency", currency }), [currency]);
  const money = (value: number) => moneyFormatter.format(value);
  const compactMoney = (value: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency, notation: "compact", maximumFractionDigits: 1,
  }).format(value);
  const digits = moneyFormatter.resolvedOptions().maximumFractionDigits ?? 2;
  const updateSavings = <K extends keyof SavingsFields>(key: K, value: SavingsFields[K]) => {
    setSavings((previous) => ({ ...previous, [key]: value })); setPage(0);
  };
  const updateLoan = <K extends keyof LoanFields>(key: K, value: LoanFields[K]) => {
    setLoan((previous) => ({ ...previous, [key]: value })); setPage(0);
  };
  const calculation = useMemo((): { savings?: SavingsResult; loan?: LoanResult; input?: SavingsInput; error?: string } => {
    try {
      if (mode === "loan") {
        const input: LoanInput = {
          ...loan, principal: numberInput(loan.principal, "loan amount"), annualRate: numberInput(loan.annualRate, "interest rate"),
          duration: numberInput(loan.duration, "loan term"), extraPayment: numberInput(loan.extraPayment, "extra payment"),
        };
        return { loan: calculateLoan(input) };
      }
      const input: SavingsInput = {
        ...savings, interestType: mode, principal: numberInput(savings.principal, "starting amount"),
        annualRate: numberInput(savings.annualRate, "interest rate"), rateType: mode === "simple" ? "nominal" : savings.rateType,
        duration: numberInput(savings.duration, "duration"), dayBasis: savings.dayBasis === "360" ? 360 : 365,
        contribution: contributionsEnabled ? numberInput(savings.contribution, "recurring contribution") : 0,
        annualContributionIncrease: contributionsEnabled ? numberInput(savings.annualContributionIncrease, "contribution increase") : 0,
        inflationRate: adjustmentsEnabled ? numberInput(savings.inflationRate, "inflation") : 0,
        taxRate: adjustmentsEnabled ? numberInput(savings.taxRate, "tax rate") : 0,
      };
      return { savings: calculateSavings(input), input };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Check your inputs." };
    }
  }, [mode, savings, loan, contributionsEnabled, adjustmentsEnabled]);
  const comparison = useMemo((): { result?: SavingsResult; error?: string } => {
    if (!compareEnabled || !calculation.input) return {};
    try {
      return { result: calculateSavings({ ...calculation.input, annualRate: numberInput(comparisonRate, "comparison rate") }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Check the comparison rate." };
    }
  }, [compareEnabled, comparisonRate, calculation.input]);
  const result = calculation.savings;
  const repayment = calculation.loan;
  const schedule = result ? savingsSchedule(result, grouping) : [];
  const count = repayment?.rows.length ?? schedule.length;
  const pageCount = Math.max(1, Math.ceil(count / 24));
  const currentPage = Math.min(page, pageCount - 1);
  const chartPoints = result ? result.rows.map((row) => ({ years: row.years, primary: row.balance, secondary: row.deposited }))
    : repayment ? [{ years: 0, primary: Number(loan.principal), secondary: 0 },
      ...repayment.rows.filter((_, i) => i % Math.max(1, Math.floor(repayment.rows.length / 240)) === 0 || i === repayment.rows.length - 1)
        .map((row) => ({ years: row.years, primary: row.balance, secondary: row.totalInterest }))] : [];
  const term = `${savings.duration} ${savings.durationUnit}`;
  const frequencyLabel = interestFrequencies.find((item) => item.value === loan.paymentFrequency)?.label.toLowerCase();
  const summary = result ? [
    `${mode === "simple" ? "Simple" : "Compound"} interest projection (${currency})`,
    `Starting amount: ${money(Number(savings.principal))}`,
    `Rate: ${savings.annualRate}% ${mode === "compound" && savings.rateType === "apy" ? "APY" : "nominal annual"}`,
    ...(mode === "compound" && savings.rateType === "nominal" ? [`Compounding: ${savings.compounding}`] : []),
    `Term: ${term}; ${savings.dayBasis}-day year`,
    ...(contributionsEnabled ? [`Contributions: ${money(Number(savings.contribution))}, ${savings.contributionFrequency}, ${savings.contributionTiming} of period; ${savings.annualContributionIncrease}% annual increase`] : []),
    `Money deposited: ${money(result.deposited)}`, `Interest earned: ${money(result.interest)}`,
    `Final balance before tax: ${money(result.balance)}`,
    ...(adjustmentsEnabled ? [`Tax estimate (${savings.taxRate}% of interest, deducted at the end): ${money(result.tax)}`,
      `After-tax balance: ${money(result.afterTax)}`, `Purchasing power (${savings.inflationRate}% inflation): ${money(result.purchasingPower)}`] : []),
    ...(comparison.result ? [`At ${comparisonRate}%: ${money(comparison.result.balance)} before tax`] : []),
    "Estimate using constant rates, equal-length periods, and unrounded intermediate amounts. No fees.",
  ].join("\n") : repayment ? [
    `Loan repayment estimate (${currency})`, `Loan amount: ${money(Number(loan.principal))}`,
    `Nominal annual interest rate: ${loan.annualRate}%`, `Original term: ${loan.duration} ${loan.durationUnit}`,
    `Scheduled ${frequencyLabel} payment: ${money(repayment.scheduledPayment)}`,
    `Extra per payment: ${money(Number(loan.extraPayment))}`,
    `Total paid: ${money(repayment.totalPaid)}`, `Total interest: ${money(repayment.interest)}`,
    `Payoff: ${repayment.paymentCount} payments (${Number(repayment.years.toFixed(3))} years)`,
    `Interest saved with extra payments: ${money(repayment.interestSaved)}`,
    "Fixed-rate estimate; interest rate / payments per year. No fees, insurance, or taxes. Intermediate amounts are unrounded.",
  ].join("\n") : "";

  function exportSchedule() {
    if (result) {
      saveFile(interestCsv(["Elapsed years", `Money deposited (${currency})`, `Interest earned (${currency})`, `Balance before tax (${currency})`],
        schedule.map((row) => [row.years.toFixed(6), row.deposited.toFixed(digits), row.interest.toFixed(digits), row.balance.toFixed(digits)])),
      `interest-${mode}-${grouping}-${currency}.csv`, "text/csv;charset=utf-8");
    } else if (repayment) {
      saveFile(interestCsv(["Payment number", "Elapsed years", `Payment (${currency})`, `Principal (${currency})`, `Interest (${currency})`, `Remaining balance (${currency})`],
        repayment.rows.map((row) => [row.period, row.years.toFixed(6), row.payment.toFixed(digits), row.principal.toFixed(digits), row.interest.toFixed(digits), row.balance.toFixed(digits)])),
      `loan-repayments-${currency}.csv`, "text/csv;charset=utf-8");
    }
  }

  function example(kind: "savings" | "deposit" | "growth") {
    setMode("compound"); setPage(0); setAdjustmentsEnabled(false); setCompareEnabled(false);
    setContributionsEnabled(kind !== "deposit");
    setSavings(kind === "deposit" ? { ...defaultSavings, principal: "10000", annualRate: "4", duration: "12", durationUnit: "months", contribution: "0" }
      : kind === "growth" ? { ...defaultSavings, principal: "5000", annualRate: "7", duration: "30", contribution: "300", annualContributionIncrease: "2" }
        : defaultSavings);
  }

  return <ToolFrame slug="interest-calculator" note="Explore savings growth, simple interest, and loan repayments. Choose how interest and recurring payments work; results update as you type.">
    <div className="interest-tool">
      <div className="interest-toolbar">
        <div className="segment" role="group" aria-label="Interest calculation">
          {([["compound", "Compound savings"], ["simple", "Simple interest"], ["loan", "Loan repayments"]] as const).map(([value, label]) =>
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setPage(0); }}>{label}</button>)}
        </div>
        <label className="field interest-currency"><span>Currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}>
          {currencies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <div className="workspace interest-workspace">
        <section className="panel stack interest-inputs" aria-label="Calculator inputs">
          <div className="interest-section-heading"><h2>{mode === "loan" ? "Your loan" : "Your starting point"}</h2><span className="interest-hint">All amounts in {currency}</span></div>
          {mode === "loan" ? <>
            <NumberField label="Loan amount" value={loan.principal} min={0.01} max={1e12} onChange={(value) => updateLoan("principal", value)} />
            <NumberField label="Annual interest rate (%)" value={loan.annualRate} max={1000} onChange={(value) => updateLoan("annualRate", value)} hint="Nominal rate excluding fees. This is not an APR quote." />
            <div className="interest-fields">
              <NumberField label="Loan term" value={loan.duration} onChange={(value) => updateLoan("duration", value)} />
              <label className="field"><span>Term unit</span><select value={loan.durationUnit} onChange={(event) => updateLoan("durationUnit", event.target.value as LoanFields["durationUnit"])}>
                <option value="years">Years</option><option value="months">Months</option>
              </select></label>
            </div>
            <label className="field"><span>Payment frequency</span><select value={loan.paymentFrequency} onChange={(event) => updateLoan("paymentFrequency", event.target.value as InterestFrequency)}>
              {interestFrequencies.filter((item) => item.value !== "daily").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select></label>
            <NumberField label="Extra payment each period" value={loan.extraPayment} max={1e12} onChange={(value) => updateLoan("extraPayment", value)} hint="Added to every scheduled payment to reduce the principal sooner." />
          </> : <>
            <NumberField label="Starting amount" value={savings.principal} max={1e12} onChange={(value) => updateSavings("principal", value)} />
            <div className="interest-fields">
              <NumberField label="Annual interest rate (%)" value={savings.annualRate} max={1000} onChange={(value) => updateSavings("annualRate", value)} />
              {mode === "compound" ? <label className="field"><span>Rate entered as</span><select value={savings.rateType} onChange={(event) => updateSavings("rateType", event.target.value as SavingsFields["rateType"])}>
                <option value="nominal">Nominal annual rate</option><option value="apy">APY / effective annual</option>
              </select></label> : <p className="interest-hint interest-field-note">Interest accrues only on your deposits; earned interest is not reinvested.</p>}
            </div>
            {mode === "compound" && (savings.rateType === "nominal" ? <label className="field"><span>Compound interest</span><select value={savings.compounding} onChange={(event) => updateSavings("compounding", event.target.value as CompoundingFrequency)}>
              {interestFrequencies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}<option value="continuous">Continuously</option>
            </select></label> : <p className="interest-hint">APY already includes compounding. Growth uses the effective annual rate you enter.</p>)}
            <div className="interest-fields">
              <NumberField label="Duration" value={savings.duration} onChange={(value) => updateSavings("duration", value)} />
              <label className="field"><span>Duration unit</span><select value={savings.durationUnit} onChange={(event) => updateSavings("durationUnit", event.target.value as DurationUnit)}>
                <option value="years">Years</option><option value="months">Months</option><option value="days">Days</option>
              </select></label>
            </div>
            <label className="field"><span id="interest-day-basis-label">Days in a year</span><select aria-labelledby="interest-day-basis-label" aria-describedby="interest-day-basis-hint" value={savings.dayBasis} onChange={(event) => updateSavings("dayBasis", event.target.value as SavingsFields["dayBasis"])}>
              <option value="365">365 days</option><option value="360">360 days</option>
            </select><small id="interest-day-basis-hint" className="interest-hint">Used for day-based durations and daily frequencies.</small></label>
            <div className="interest-option">
              <label className="check"><input type="checkbox" checked={contributionsEnabled} onChange={(event) => { setContributionsEnabled(event.target.checked); setPage(0); }} />Add recurring contributions</label>
              {contributionsEnabled && <div className="stack interest-option-body">
                <div className="interest-fields">
                  <NumberField label="Contribution amount" value={savings.contribution} max={1e12} onChange={(value) => updateSavings("contribution", value)} />
                  <label className="field"><span>Contribute</span><select value={savings.contributionFrequency} onChange={(event) => updateSavings("contributionFrequency", event.target.value as InterestFrequency)}>
                    {interestFrequencies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select></label>
                </div>
                <label className="field"><span>Contribution timing</span><select value={savings.contributionTiming} onChange={(event) => updateSavings("contributionTiming", event.target.value as SavingsFields["contributionTiming"])}>
                  <option value="end">End of each period</option><option value="beginning">Beginning of each period</option>
                </select></label>
                <NumberField label="Annual contribution increase (%)" value={savings.annualContributionIncrease} max={100} onChange={(value) => updateSavings("annualContributionIncrease", value)} hint="Increase the contribution amount after each full year of contributions." />
              </div>}
            </div>
            <div className="interest-option">
              <label className="check"><input type="checkbox" checked={adjustmentsEnabled} onChange={(event) => setAdjustmentsEnabled(event.target.checked)} />Estimate tax and inflation</label>
              {adjustmentsEnabled && <div className="stack interest-option-body">
                <div className="interest-fields">
                  <NumberField label="Tax on interest (%)" value={savings.taxRate} max={100} onChange={(value) => updateSavings("taxRate", value)} />
                  <NumberField label="Annual inflation (%)" value={savings.inflationRate} max={100} onChange={(value) => updateSavings("inflationRate", value)} />
                </div>
                <p className="interest-hint">Tax is deducted once at the end. Inflation shows the after-tax balance in today's purchasing power.</p>
              </div>}
            </div>
          </>}
          <div className="row interest-input-actions">
            <button type="button" className="btn ghost" onClick={() => {
              if (mode === "loan") setLoan(defaultLoan);
              else { setSavings(defaultSavings); setContributionsEnabled(true); setAdjustmentsEnabled(false); setCompareEnabled(false); setComparisonRate("6"); }
              setPage(0);
            }}>Reset inputs</button>
          </div>
          {mode !== "loan" && <details className="interest-details"><summary>Load an example</summary><div className="row interest-option-body">
            <button className="btn ghost" type="button" onClick={() => example("savings")}>Regular savings</button>
            <button className="btn ghost" type="button" onClick={() => example("deposit")}>Fixed deposit</button>
            <button className="btn ghost" type="button" onClick={() => example("growth")}>Long-term growth</button>
          </div><p className="interest-hint">Illustrative amounts and rates; edit them to match your situation.</p></details>}
        </section>
        <div className="stack interest-results">
          <section className="panel stack" aria-label="Calculation results">
            <h2>{mode === "loan" ? "Your repayment estimate" : "Your growth estimate"}</h2>
            <div aria-live="polite" aria-atomic="true">
              {calculation.error ? <p className="interest-error" role="alert">{calculation.error}</p> : result ? <>
                <div className="interest-total"><span>Final balance before tax</span><strong>{money(result.balance)}</strong><small>after {term}</small></div>
                <div className="stat-grid">
                  <div className="stat"><span>Money deposited</span><b>{money(result.deposited)}</b></div>
                  <div className="stat"><span>Interest earned</span><b>{money(result.interest)}</b></div>
                  <div className="stat"><span>Recurring deposits</span><b>{money(result.contributions)}</b><small>{result.contributionCount.toLocaleString()} contributions</small></div>
                  <div className="stat"><span>{mode === "simple" ? "Annual simple rate" : "Effective annual yield"}</span><b>{result.effectiveAnnualRate.toLocaleString("en-US", { maximumFractionDigits: 4 })}%</b></div>
                </div>
                {adjustmentsEnabled && <div className="interest-adjustments">
                  <div><span>Estimated tax on interest</span><strong>{money(result.tax)}</strong></div>
                  <div><span>Balance after tax</span><strong>{money(result.afterTax)}</strong></div>
                  <div><span>Today's purchasing power</span><strong>{money(result.purchasingPower)}</strong></div>
                </div>}
              </> : repayment ? <>
                <div className="interest-total"><span>Scheduled {frequencyLabel} payment</span><strong>{money(repayment.scheduledPayment)}</strong><small>before extra payments</small></div>
                <div className="stat-grid">
                  <div className="stat"><span>With your extra payment</span><b>{money(repayment.regularPayment)}</b></div>
                  <div className="stat"><span>Total interest</span><b>{money(repayment.interest)}</b></div>
                  <div className="stat"><span>Total repaid</span><b>{money(repayment.totalPaid)}</b></div>
                  <div className="stat"><span>Paid off after</span><b>{repayment.paymentCount.toLocaleString()} payments</b><small>{Number(repayment.years.toFixed(3))} years</small></div>
                </div>
                {Number(loan.extraPayment) > 0 && <p className="interest-saved">Extra payments save {money(repayment.interestSaved)} in interest and {repayment.periodsSaved.toLocaleString()} payment periods.</p>}
              </> : null}
            </div>
            {chartPoints.length > 0 && <ProjectionChart points={chartPoints} money={compactMoney} loan={mode === "loan"} />}
            <div className="row"><CopyButton text={summary} label="Copy summary" /><button className="btn ghost" type="button" disabled={!summary} onClick={exportSchedule}>Download CSV</button></div>
            <p className="interest-hint">Calculated in this browser. Currency changes the display; it does not convert amounts.</p>
          </section>
          {mode !== "loan" && <section className="panel stack" aria-label="Compare interest rates">
            <label className="check"><input type="checkbox" checked={compareEnabled} onChange={(event) => setCompareEnabled(event.target.checked)} />Compare another interest rate</label>
            {compareEnabled && <>
              <NumberField label={`Comparison annual rate (%)${savings.rateType === "apy" && mode === "compound" ? " — APY" : ""}`} value={comparisonRate} max={1000} onChange={setComparisonRate} />
              {comparison.error ? <p className="interest-error" role="alert">{comparison.error}</p> : comparison.result && result ? <div className="interest-comparison">
                <div><span>At {savings.annualRate}%</span><strong>{money(result.balance)}</strong></div>
                <div><span>At {comparisonRate}%</span><strong>{money(comparison.result.balance)}</strong></div>
                <p>{money(Math.abs(comparison.result.balance - result.balance))} {comparison.result.balance >= result.balance ? "more" : "less"} before tax, with the same deposits and term.</p>
              </div> : <p className="interest-hint">Complete your starting inputs to compare rates.</p>}
            </>}
          </section>}
        </div>
      </div>
      {summary && <section className="panel stack interest-schedule" aria-label={repayment ? "Repayment schedule" : "Growth schedule"}>
        <div className="interest-section-heading"><h2>{repayment ? "Repayment schedule" : "Growth schedule"}</h2>
          {result && <div className="segment" role="group" aria-label="Schedule interval">
            <button type="button" aria-pressed={grouping === "yearly"} onClick={() => { setGrouping("yearly"); setPage(0); }}>Yearly</button>
            <button type="button" aria-pressed={grouping === "monthly"} onClick={() => { setGrouping("monthly"); setPage(0); }}>Monthly</button>
          </div>}
        </div>
        <div className="interest-table-scroll" tabIndex={0} role="region" aria-label="Scrollable calculation schedule">
          <table className="interest-table"><caption>{repayment ? "Payments are at the end of each period. The final payment may be smaller." : "Balances before tax. The final row includes any partial reporting period."} Amounts in {currency}.</caption>
            <thead><tr>{(repayment ? ["Payment", "Paid", "Principal", "Interest", "Balance"] : ["Elapsed time", "Deposited", "Interest earned", "Balance"]).map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{repayment ? repayment.rows.slice(currentPage * 24, (currentPage + 1) * 24).map((row) => <tr key={row.period}>
              <th scope="row">{row.period}</th><td>{money(row.payment)}</td><td>{money(row.principal)}</td><td>{money(row.interest)}</td><td>{money(row.balance)}</td>
            </tr>) : schedule.slice(currentPage * 24, (currentPage + 1) * 24).map((row) => <tr key={row.years}>
              <th scope="row">{row.years === 0 ? "Start" : `${Number((row.years * (grouping === "monthly" ? 12 : 1)).toFixed(3))} ${grouping === "monthly" ? "mo" : "yr"}`}</th>
              <td>{money(row.deposited)}</td><td>{money(row.interest)}</td><td>{money(row.balance)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="interest-section-heading"><p className="interest-hint">{count.toLocaleString()} rows. CSV includes the entire {repayment ? "repayment" : grouping} schedule.</p>
          {pageCount > 1 && <div className="row"><button type="button" className="btn ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <span className="interest-hint">Page {currentPage + 1} of {pageCount}</span><button type="button" className="btn ghost" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
        </div>
      </section>}
      <details className="panel interest-assumptions"><summary>How the calculations work</summary>
        {mode === "loan" ? <>
          <p>Payments use a fixed nominal annual rate divided by the number of payments per year. The scheduled payment amortizes the loan over the original term. Extra payments reduce principal after each period's interest, shortening the term; the final payment clears the balance.</p>
          <p>Payment formula: P × i / (1 − (1 + i)<sup>−N</sup>), where i is the rate per payment period and N is the number of payments. At a zero rate, payment = P / N. Weekly and biweekly schedules use 52 and 26 equal periods per year; these are independently amortized schedules, not accelerated half-monthly mortgage plans.</p>
          <p>Fees, insurance, taxes, lender-specific day counts, and payment-by-payment rounding are excluded. Amounts are rounded only for display; a lender's schedule can differ.</p>
        </> : <>
          <p>{mode === "simple" ? "Simple interest = deposited principal × annual rate × elapsed years. Each contribution earns interest only for its remaining time. Interest already earned never earns interest."
            : "Without contributions, compound balance = P × (1 + r/n)^(n × t). Continuous compounding uses P × e^(r × t). An APY uses P × (1 + APY)^t directly, so compounding is not applied twice."}</p>
          <p>Rates stay constant. Months, weeks, and contribution periods have equal lengths; no calendar start date is used. Fractional compound periods use equivalent exponential growth. This is a projection, so bank interest posting and day-by-day rounding can differ.</p>
          <p>Beginning contributions start immediately and exclude the maturity instant. End contributions start after one full contribution period and include the maturity instant. Only scheduled deposits are added; no deposit is prorated for a partial final period. Schedule rows include deposits at that instant. Annual increases start after a full year's worth of contribution periods.</p>
          <p>Tax is a flat estimate on total interest, deducted once at maturity. It does not model annual withholding, allowances, or tax brackets. Inflation discounts the after-tax balance by (1 + inflation)^years. Fees and withdrawals are excluded. Amounts are rounded only for display.</p>
          <p>Learn more: <a href="https://www.consumerfinance.gov/ask-cfpb/how-does-compound-interest-work-en-1683/" target="_blank" rel="noreferrer">CFPB: compound interest</a> · <a href="https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator" target="_blank" rel="noreferrer">Investor.gov calculator</a>.</p>
        </>}
      </details>
    </div>
  </ToolFrame>;
}
