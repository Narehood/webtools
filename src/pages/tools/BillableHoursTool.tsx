import { useMemo, useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import { calculateBillableHours, calculateTotalHours, clockTimeInput, formatBillableDecimalHours, formatBillingAmount, formatDuration, parseClockTime } from "../../lib/billing";

type Period = "AM" | "PM";
type TimeFormat = "12h" | "24h";

function formatClockField(minutes: number, timeFormat: TimeFormat) {
  const hour = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, "0");
  return {
    value: `${timeFormat === "12h" ? hour % 12 || 12 : String(hour).padStart(2, "0")}:${minute}`,
    period: (hour >= 12 ? "PM" : "AM") as Period,
  };
}

function ClockTimeField({ name, label, value, period, timeFormat, onChange, onPeriodChange }: {
  name: string;
  label: string;
  value: string;
  period: Period;
  timeFormat: TimeFormat;
  onChange: (value: string) => void;
  onPeriodChange: (period: Period) => void;
}) {
  function changeTime(raw: string) {
    const withPeriod = /^(.*?)\s*(AM|PM)\s*$/i.exec(raw);
    if (timeFormat === "12h" && withPeriod) {
      onChange(withPeriod[1].trim());
      onPeriodChange(withPeriod[2].toUpperCase() as Period);
    } else {
      onChange(raw);
    }
  }

  function normalizeTime() {
    try {
      const next = formatClockField(parseClockTime(clockTimeInput(value, period, timeFormat)), timeFormat);
      onChange(next.value);
      onPeriodChange(next.period);
    } catch { /* Leave invalid or incomplete input available for correction. */ }
  }

  return (
    <div className="field">
      <label htmlFor={name}><span>{label}</span></label>
      <div className="billing-time-entry">
        <input id={name} name={name} value={value} onChange={(event) => changeTime(event.target.value)} onBlur={normalizeTime} placeholder={timeFormat === "12h" ? "1:30" : "13:30"} maxLength={32} aria-describedby="billing-time-help" spellCheck={false} autoComplete="off" />
        {timeFormat === "12h" && (
          <div className="segmented billing-switch" role="group" aria-label={`${label} AM or PM`}>
            {(["AM", "PM"] as const).map((option) => (
              <button key={option} type="button" className={period === option ? "on" : ""} aria-pressed={period === option} onClick={() => onPeriodChange(option)}>{option}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function BillableHoursTool() {
  const [entryMode, setEntryMode] = useState<"times" | "hours">("times");
  const [timeFormat, setTimeFormat] = useState<TimeFormat>("12h");
  const [start, setStart] = useState("1:30");
  const [startPeriod, setStartPeriod] = useState<Period>("PM");
  const [end, setEnd] = useState("3:10");
  const [endPeriod, setEndPeriod] = useState<Period>("PM");
  const [totalHours, setTotalHours] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [unpaidBreak, setUnpaidBreak] = useState("0");
  const startTime = clockTimeInput(start, startPeriod, timeFormat);
  const endTime = clockTimeInput(end, endPeriod, timeFormat);

  function changeTimeFormat(nextFormat: TimeFormat) {
    if (nextFormat === timeFormat) return;
    for (const [value, setValue, setPeriod] of [[startTime, setStart, setStartPeriod], [endTime, setEnd, setEndPeriod]] as const) {
      try {
        const next = formatClockField(parseClockTime(value), nextFormat);
        setValue(next.value);
        setPeriod(next.period);
      } catch { /* Keep incomplete entries so they can still be edited. */ }
    }
    setTimeFormat(nextFormat);
  }

  const result = useMemo(() => {
    if (!hourlyRate.trim() || (entryMode === "times" ? !start.trim() || !end.trim() : !totalHours.trim())) return null;
    try {
      const value = entryMode === "times"
        ? calculateBillableHours(startTime, endTime, hourlyRate, unpaidBreak)
        : calculateTotalHours(totalHours, hourlyRate, unpaidBreak);
      return { ok: true as const, value };
    } catch (error) {
      let message = error instanceof Error ? error.message : "Could not calculate billable hours.";
      const invalidClock = /^(Start|End) time:/.exec(message);
      if (entryMode === "times" && invalidClock) {
        message = `${invalidClock[1]} time: ${timeFormat === "12h" ? "enter a time such as 1:30 or 1 and choose AM or PM, or use the 24-hour format control for times such as 13:30." : "enter a 24-hour time such as 13:30."} Minutes must be between 0 and 59.`;
      }
      return { ok: false as const, message };
    }
  }, [entryMode, timeFormat, start, end, startTime, endTime, totalHours, hourlyRate, unpaidBreak]);
  const bill = result?.ok ? result.value : null;
  const decimalHours = bill ? formatBillableDecimalHours(bill) : null;
  const summary = bill ? [
    entryMode === "times" ? `${startTime} - ${endTime}${bill.nextDay ? " (next day)" : ""}` : `Total hours entered: ${totalHours.trim()}`,
    `${entryMode === "times" ? "Elapsed time" : "Total time entered"}: ${formatDuration(bill.elapsedMinutes)}`,
    `Unpaid break: ${bill.breakMinutes} minutes`,
    `Billable time: ${formatDuration(bill.billableMinutes)}${decimalHours?.reproducesPay ? ` (${decimalHours.exact ? "" : "approximately "}${decimalHours.text} hours)` : ""}`,
    `Hourly rate: ${formatBillingAmount(bill.hourlyRateCents)}`,
    `Total pay: ${formatBillingAmount(bill.totalCents)}`,
  ].join("\n") : "";

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Billable hours</h1>
        <p className="lede">Enter start and end times or total hours, plus your hourly rate, to calculate total pay.</p>
      </header>
      <div className="workspace billing-workspace">
        <section className="panel stack" aria-label="Work session">
          <div className="field">
            <span>Enter time by</span>
            <div className="segmented billing-switch" role="group" aria-label="Time entry method">
              <button type="button" className={entryMode === "times" ? "on" : ""} aria-pressed={entryMode === "times"} onClick={() => setEntryMode("times")}>Start / end times</button>
              <button type="button" className={entryMode === "hours" ? "on" : ""} aria-pressed={entryMode === "hours"} onClick={() => setEntryMode("hours")}>Total hours</button>
            </div>
          </div>
          {entryMode === "times" ? (
            <>
              <div className="field">
                <span>Time format</span>
                <div className="segmented billing-switch" role="group" aria-label="Time format">
                  <button type="button" className={timeFormat === "12h" ? "on" : ""} aria-pressed={timeFormat === "12h"} onClick={() => changeTimeFormat("12h")}>12-hour</button>
                  <button type="button" className={timeFormat === "24h" ? "on" : ""} aria-pressed={timeFormat === "24h"} onClick={() => changeTimeFormat("24h")}>24-hour</button>
                </div>
              </div>
              <ClockTimeField name="start" label="Start time" value={start} period={startPeriod} timeFormat={timeFormat} onChange={setStart} onPeriodChange={setStartPeriod} />
              <ClockTimeField name="end" label="End time" value={end} period={endPeriod} timeFormat={timeFormat} onChange={setEnd} onPeriodChange={setEndPeriod} />
              <p className="lede" id="billing-time-help" style={{ marginBottom: 0 }}>{timeFormat === "12h" ? "Enter 1:30 or just 1 and choose AM or PM. You can also enter 13:30; it converts to 1:30 PM when you leave the field." : "Enter a 24-hour time such as 13:30."} A single minute digit is accepted: 1:5 means 1:05. An earlier end time means the next day; matching times mean zero hours.</p>
            </>
          ) : (
            <>
              <label className="field">
                <span>Total hours</span>
                <input name="totalHours" value={totalHours} onChange={(event) => setTotalHours(event.target.value)} placeholder="7.5" inputMode="decimal" maxLength={16} aria-describedby="billing-hours-help" />
              </label>
              <p className="lede" id="billing-hours-help" style={{ marginBottom: 0 }}>Use decimal hours, such as 7.5 for 7 hours 30 minutes, with up to four decimal places. Any unpaid break below is subtracted from this total.</p>
            </>
          )}
          <label className="field">
            <span>Hourly rate ($)</span>
            <input name="hourlyRate" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} placeholder="50.00" inputMode="decimal" maxLength={16} />
          </label>
          <label className="field">
            <span>Unpaid break (minutes, optional)</span>
            <input name="unpaidBreak" value={unpaidBreak} onChange={(event) => setUnpaidBreak(event.target.value)} placeholder="0" inputMode="numeric" maxLength={8} />
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
                  <div className="stat"><span>{decimalHours?.exact ? "Decimal hours" : "Approx. decimal hours"}</span><b>{decimalHours?.exact ? "" : "≈ "}{decimalHours?.text}</b></div>
                  <div className="stat"><span>{entryMode === "times" ? "Elapsed time" : "Total time entered"}</span><b>{formatDuration(bill.elapsedMinutes)}</b></div>
                  <div className="stat"><span>Unpaid break</span><b>{bill.breakMinutes} min</b></div>
                </div>
                {bill.nextDay && <p className="lede" style={{ marginBottom: 0 }}>This session ends the next day.</p>}
                {!decimalHours?.exact && <p className="lede" style={{ marginBottom: 0 }}>Decimal hours are approximate. Total pay uses the exact billable time.</p>}
                <p className="lede" style={{ marginBottom: 0 }}>{Number(bill.billableMinutes.toFixed(4))} billable minutes at {formatBillingAmount(bill.hourlyRateCents)}/hour. {entryMode === "times" ? "Pay uses exact minutes." : "Pay uses the decimal hours entered after subtracting any unpaid break."} The total is rounded to the nearest cent.</p>
              </div>
            ) : result && !result.ok ? (
              <p className="lede" role="alert">{result.message}</p>
            ) : (
              <p className="lede">{entryMode === "times" ? "Enter a start time, end time, and hourly rate" : "Enter total hours and an hourly rate"} to see your total.</p>
            )}
          </div>
          <div className="row"><CopyButton text={summary} /></div>
        </section>
      </div>
    </>
  );
}
