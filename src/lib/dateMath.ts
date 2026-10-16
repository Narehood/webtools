const DAY = 86_400_000;

/** Calendar dates use UTC internally so daylight-saving changes cannot lose a day. */
export function parseCalendarDate(input: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) throw new Error("Enter a date in YYYY-MM-DD format.");
  const [, year, month, day] = match.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Enter a real calendar date between years 0001 and 9999.");
  }
  return date;
}

function formatDate(date: Date): string {
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
    throw new Error("The result must be between years 0001 and 9999.");
  }
  return date.toISOString().slice(0, 10);
}

function isWeekday(date: Date): boolean {
  return date.getUTCDay() !== 0 && date.getUTCDay() !== 6;
}

export function dateDifference(start: string, end: string, includeLast = false) {
  const a = parseCalendarDate(start);
  const b = parseCalendarDate(end);
  const direction = a.getTime() <= b.getTime() ? 1 : -1;
  const first = direction === 1 ? a : b;
  const elapsedDays = Math.abs(b.getTime() - a.getTime()) / DAY;
  const days = elapsedDays + (includeLast ? 1 : 0);
  let weekdays = Math.floor(days / 7) * 5;
  const remainder = days % 7;
  for (let i = 0; i < remainder; i += 1) {
    const weekday = (first.getUTCDay() + i) % 7;
    if (weekday !== 0 && weekday !== 6) weekdays += 1;
  }
  return {
    days: days === 0 ? 0 : direction * days,
    weekdays: weekdays === 0 ? 0 : direction * weekdays,
    weekendDays: days === weekdays ? 0 : direction * (days - weekdays),
    elapsedDays: elapsedDays === 0 ? 0 : direction * elapsedDays,
  };
}

export function addDateDays(input: string, amount: string, weekdaysOnly = false): string {
  const date = parseCalendarDate(input);
  if (!/^[+-]?\d+$/.test(amount.trim())) throw new Error("Enter a whole number of days; use a minus sign to subtract.");
  const count = Number(amount);
  if (!Number.isSafeInteger(count) || Math.abs(count) > 3_650_000) throw new Error("Enter at most 3,650,000 days in either direction.");
  if (!weekdaysOnly) {
    date.setUTCDate(date.getUTCDate() + count);
  } else {
    const step = count < 0 ? -1 : 1;
    let remaining = Math.abs(count);
    // Reach a weekday before skipping complete five-day work weeks.
    while (remaining > 0 && !isWeekday(date)) {
      date.setUTCDate(date.getUTCDate() + step);
      if (isWeekday(date)) remaining -= 1;
    }
    date.setUTCDate(date.getUTCDate() + Math.floor(remaining / 5) * 7 * step);
    remaining %= 5;
    while (remaining > 0) {
      date.setUTCDate(date.getUTCDate() + step);
      if (isWeekday(date)) remaining -= 1;
    }
  }
  return formatDate(date);
}

export function todayDate(): string {
  const now = new Date();
  return `${now.getFullYear().toString().padStart(4, "0")}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;
}
