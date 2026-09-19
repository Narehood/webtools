export type TimestampUnit = "seconds" | "milliseconds" | "iso";

export function parseTimestamp(raw: string, unit: TimestampUnit): Date {
  const value = raw.trim();
  if (!value) throw new Error("Enter a timestamp");
  let date: Date;
  if (unit === "iso") {
    const match = /^([+-]?\d{4,6})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
    if (!match) throw new Error("Enter an ISO date or date-time");
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw new Error("Enter a valid calendar date");
    date = new Date(value);
  } else {
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) throw new Error(`Enter Unix ${unit}, or select ISO date-time`);
    date = new Date(Number(value) * (unit === "seconds" ? 1000 : 1));
  }
  if (!Number.isFinite(date.getTime())) throw new Error("Timestamp is outside the supported date range");
  return date;
}
