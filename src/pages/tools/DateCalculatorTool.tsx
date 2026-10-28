import { useMemo, useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import { addDateDays, dateDifference, todayDate } from "../../lib/dateMath";

export function DateCalculatorTool() {
  const [mode, setMode] = useState<"difference" | "add">("difference");
  const [start, setStart] = useState(todayDate);
  const [end, setEnd] = useState(() => addDateDays(todayDate(), "7"));
  const [amount, setAmount] = useState("30");
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const [includeLast, setIncludeLast] = useState(false);
  const result = useMemo(() => {
    try {
      if (mode === "add") return { date: addDateDays(start, amount, weekdaysOnly) };
      return { difference: dateDifference(start, end, includeLast) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not calculate dates." };
    }
  }, [start, end, amount, weekdaysOnly, includeLast, mode]);
  const summary = result.date ? `${start} ${Number(amount) < 0 ? "−" : "+"} ${Math.abs(Number(amount))} ${weekdaysOnly ? "weekdays" : "days"} = ${result.date}`
    : result.difference ? `${start} → ${end}: ${result.difference.days} days, ${result.difference.weekdays} weekdays, ${result.difference.weekendDays} weekend days. ${includeLast ? "Both dates included." : "Earlier date included; later date excluded."}` : "";

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Date calculator</h1>
        <p className="lede">Count calendar days and weekdays, or find a date before or after another date.</p>
      </header>
      <div className="segment" role="group" aria-label="Date calculation" style={{ marginBottom: 16 }}>
        <button type="button" aria-pressed={mode === "difference"} onClick={() => setMode("difference")}>Between dates</button>
        <button type="button" aria-pressed={mode === "add"} onClick={() => setMode("add")}>Add or subtract days</button>
      </div>
      <div className="workspace">
        <section className="panel stack" aria-label="Dates">
          <label className="field"><span>Start date</span><input type="date" min="0001-01-01" max="9999-12-31" value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <div className="row"><button className="btn ghost" type="button" onClick={() => setStart(todayDate())}>Use today</button></div>
          {mode === "difference" ? <>
            <label className="field"><span>End date</span><input type="date" min="0001-01-01" max="9999-12-31" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={includeLast} onChange={(event) => setIncludeLast(event.target.checked)} />Include both dates</label>
            <p className="lede">By default, the earlier date is included and the later date is excluded. Results are negative when the end is before the start.</p>
          </> : <>
            <label className="field"><span>Days to add or subtract</span><input inputMode="text" maxLength={12} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="30 or -30" /></label>
            <label className="check"><input type="checkbox" checked={weekdaysOnly} onChange={(event) => setWeekdaysOnly(event.target.checked)} />Skip Saturdays and Sundays</label>
            <p className="lede">Use a negative number to go backwards. Counting starts after the start date; zero keeps the same date.</p>
          </>}
          <p className="lede">Weekdays are Monday–Friday; holidays are not excluded. These are calendar dates, so daylight-saving changes do not affect the count.</p>
        </section>
        <section className="panel stack" aria-label="Date result">
          <div aria-live="polite" aria-atomic="true">
            {result.error ? <p className="lede" role="alert">{result.error}</p> : result.date ? <div className="stat"><span>Resulting date</span><b className="calc-result">{result.date}</b></div> : result.difference ? <div className="stat-grid">
              <div className="stat"><span>Calendar days</span><b>{result.difference.days.toLocaleString()}</b></div>
              <div className="stat"><span>Weekdays</span><b>{result.difference.weekdays.toLocaleString()}</b></div>
              <div className="stat"><span>Weekend days</span><b>{result.difference.weekendDays.toLocaleString()}</b></div>
              <div className="stat"><span>Weeks + days</span><b>{Math.trunc(result.difference.days / 7)}w {Math.abs(result.difference.days % 7)}d{result.difference.days < 0 ? " backwards" : ""}</b></div>
            </div> : null}
          </div>
          <div className="row"><CopyButton text={summary} /></div>
        </section>
      </div>
    </>
  );
}
