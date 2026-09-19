export function parseClockTime(raw: string): number {
  const value = raw.trim();
  const twelveHour = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(value);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] ?? 0);
    if (hour >= 1 && hour <= 12 && minute < 60) {
      return (hour % 12 + (twelveHour[3].toLowerCase() === "pm" ? 12 : 0)) * 60 + minute;
    }
  } else {
    const twentyFourHour = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (twentyFourHour) {
      const hour = Number(twentyFourHour[1]);
      const minute = Number(twentyFourHour[2]);
      if (hour < 24 && minute < 60) return hour * 60 + minute;
    }
  }
  throw new Error("Use a time such as 1:30PM or 13:30.");
}

function parseHourlyRate(raw: string): bigint {
  const value = raw.trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value)) {
    throw new Error("Enter a nonnegative hourly rate with at most two decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function calculateBillableHours(start: string, end: string, hourlyRate: string, unpaidBreak = "0") {
  let startMinutes: number;
  let endMinutes: number;
  try { startMinutes = parseClockTime(start); }
  catch { throw new Error("Start time: use a time such as 1:30PM or 13:30."); }
  try { endMinutes = parseClockTime(end); }
  catch { throw new Error("End time: use a time such as 3:10PM or 15:10."); }

  const nextDay = endMinutes < startMinutes;
  const elapsedMinutes = endMinutes - startMinutes + (nextDay ? 1440 : 0);
  const breakValue = unpaidBreak.trim() || "0";
  if (!/^\d+$/.test(breakValue)) throw new Error("Enter unpaid break time as a nonnegative whole number of minutes.");
  const breakMinutes = Number(breakValue);
  if (!Number.isSafeInteger(breakMinutes) || breakMinutes > elapsedMinutes) {
    throw new Error("Unpaid break time cannot exceed the time between start and end.");
  }
  const billableMinutes = elapsedMinutes - breakMinutes;
  const hourlyRateCents = parseHourlyRate(hourlyRate);
  // Keep money in integer cents and round only after multiplying by exact minutes.
  const totalCents = (BigInt(billableMinutes) * hourlyRateCents + 30n) / 60n;
  return { elapsedMinutes, breakMinutes, billableMinutes, hourlyRateCents, totalCents, nextDay };
}

export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatBillingAmount(cents: bigint): string {
  return `$${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}
