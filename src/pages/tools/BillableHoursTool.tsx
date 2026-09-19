import { useMemo, useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import { calculateBillableHours, formatBillingAmount, formatDuration } from "../../lib/billing";

export function BillableHoursTool() {
  const [start, setStart] = useState("1:30PM");
  const [end, setEnd] = useState("3:10PM");
  const [hourlyRate, setHourlyRate] = useState("");
  const [unpaidBreak, setUnpaidBreak] = useState("0");
  const result = useMemo(() => {
    if (!start.trim() || !end.trim() || !hourlyRate.trim()) return null;
    try {
      return { ok: true as const, value: calculateBillableHours(start, end, hourlyRate, unpaidBreak) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Could not calculate billable hours." };
    }
  }, [start, end, hourlyRate, unpaidBreak]);
  const bill = result?.ok ? result.value : null;
  const decimalHours = bill ? (bill.billableMinutes / 60).toFixed(4).replace(/\.?0+$/, "") : "";
  const summary = bill ? [
    `${start.trim()} - ${end.trim()}${bill.nextDay ? " (next day)" : ""}`,
    `Elapsed time: ${formatDuration(bill.elapsedMinutes)}`,
    `Unpaid break: ${bill.breakMinutes} minutes`,
    `Billable time: ${formatDuration(bill.billableMinutes)} (${decimalHours} hours)`,
    `Hourly rate: ${formatBillingAmount(bill.hourlyRateCents)}`,
    `Total pay: ${formatBillingAmount(bill.totalCents)}`,
  ].join("\n") : "";

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Billable hours</h1>
        <p className="lede">Enter your start time, end time, and hourly rate to calculate time worked and total pay.</p>
      </header>
      <div className="workspace">
        <section className="panel stack" aria-label="Work session">
          <label className="field">
            <span>Start time</span>
            <input name="start" value={start} onChange={(event) => setStart(event.target.value)} placeholder="1:30PM" maxLength={32} aria-describedby="billing-time-help" spellCheck={false} autoComplete="off" />
          </label>
          <label className="field">
            <span>End time</span>
            <input name="end" value={end} onChange={(event) => setEnd(event.target.value)} placeholder="3:10PM" maxLength={32} aria-describedby="billing-time-help" spellCheck={false} autoComplete="off" />
          </label>
          <p className="lede" id="billing-time-help" style={{ marginBottom: 0 }}>Use AM/PM or 24-hour time. An earlier end time means the next day; matching times mean zero hours.</p>
          <label className="field">
            <span>Hourly rate ($)</span>
            <input name="hourlyRate" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} placeholder="50.00" inputMode="decimal" maxLength={16} />
          </label>
          <label className="field">
            <span>Unpaid break (minutes, optional)</span>
            <input name="unpaidBreak" value={unpaidBreak} onChange={(event) => setUnpaidBreak(event.target.value)} placeholder="0" inputMode="numeric" maxLength={4} />
          </label>
        </section>
        <section className="panel stack" aria-label="Billing result">
          <div aria-live="polite" aria-atomic="true">
            {bill ? (
              <div className="stack">
                <div className="billing-total">
                  <span>Total pay</span>
                  <strong className="wrap">{formatBillingAmount(bill.totalCents)}</strong>
                </div>
                <div className="stat-grid">
                  <div className="stat"><span>Billable time</span><b>{formatDuration(bill.billableMinutes)}</b></div>
                  <div className="stat"><span>Decimal hours</span><b>{decimalHours}</b></div>
                  <div className="stat"><span>Elapsed time</span><b>{formatDuration(bill.elapsedMinutes)}</b></div>
                  <div className="stat"><span>Unpaid break</span><b>{bill.breakMinutes} min</b></div>
                </div>
                {bill.nextDay && <p className="lede" style={{ marginBottom: 0 }}>This session ends the next day.</p>}
                <p className="lede" style={{ marginBottom: 0 }}>{bill.billableMinutes} billable minutes at {formatBillingAmount(bill.hourlyRateCents)}/hour. Pay uses exact minutes and is rounded to the nearest cent.</p>
              </div>
            ) : result && !result.ok ? (
              <p className="lede" role="alert">{result.message}</p>
            ) : (
              <p className="lede">Enter a start time, end time, and hourly rate to see your total.</p>
            )}
          </div>
          <div className="row"><CopyButton text={summary} /></div>
        </section>
      </div>
    </>
  );
}
