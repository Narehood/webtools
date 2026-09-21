const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function expand(field: string, min: number, max: number, names: string[] = []) {
  const normalized = field.replace(/[a-z]+/gi, (name) => {
    const index = names.findIndex((value) => value.slice(0, 3).toLowerCase() === name.toLowerCase());
    if (index < 0) throw new Error(`Unknown name: ${name}`);
    return String(index + min);
  });
  const values = new Set<number>();
  for (const piece of normalized.split(",")) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(piece);
    if (!match) throw new Error(`Bad field: ${field}`);
    const [, range, stepRaw] = match;
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isSafeInteger(step) || step < 1) throw new Error("Cron steps must be positive whole numbers");
    const [startRaw, endRaw] = range.split("-");
    const start = range === "*" ? min : Number(startRaw);
    const end = range === "*" ? max : endRaw !== undefined ? Number(endRaw) : stepRaw ? max : start;
    if (start < min || end > max || start > end) throw new Error(`Field must be within ${min}–${max}: ${field}`);
    for (let n = start; n <= end; n += step) values.add(n);
  }
  return [...values].sort((a, b) => a - b);
}

function describe(values: number[], all: number, unit: string, names?: string[]) {
  if (values.length === all) return `every ${unit}`;
  if (values.length === 1) return names ? names[values[0]] : `${unit} ${values[0]}`;
  const label = values.map((value) => (names ? names[value] : String(value))).join(", ");
  return `${unit}s ${label}`;
}

export type ParsedCron = {
  minute: number[];
  hour: number[];
  day: number[];
  month: number[];
  weekday: number[];
  dayField: string;
  weekdayField: string;
};

export function parseCron(expression: string): ParsedCron {
  if (expression.length > 512) throw new Error("Cron expression is too long");
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("Use a five-field cron: minute hour day month weekday");
  return {
    minute: expand(parts[0], 0, 59),
    hour: expand(parts[1], 0, 23),
    day: expand(parts[2], 1, 31),
    month: expand(parts[3], 1, 12, MONTHS),
    weekday: [...new Set(expand(parts[4], 0, 7, WEEKDAYS).map((value) => value % 7))].sort((a, b) => a - b),
    dayField: parts[2],
    weekdayField: parts[4],
  };
}

export function explainCron(expression: string) {
  const parsed = parseCron(expression);
  const dayText = describe(parsed.day, 31, "day of the month");
  const weekdayText = describe(parsed.weekday, 7, "day of the week", WEEKDAYS);
  // Traditional five-field cron uses OR when both day fields are restricted.
  const days = parsed.dayField === "*" ? weekdayText : parsed.weekdayField === "*" ? dayText
    : `${dayText} ${parsed.dayField.startsWith("*") || parsed.weekdayField.startsWith("*") ? "and" : "or"} ${weekdayText}`;
  return `At ${describe(parsed.minute, 60, "minute")}, during ${describe(parsed.hour, 24, "hour")}, on ${days}, in ${describe(parsed.month, 12, "month", ["", ...MONTHS])}.`;
}

function matchesDay(date: Date, cron: ParsedCron) {
  const dayOfMonth = cron.day.includes(date.getDate());
  const dayOfWeek = cron.weekday.includes(date.getDay());
  if (cron.dayField === "*") return dayOfWeek;
  if (cron.weekdayField === "*") return dayOfMonth;
  if (cron.dayField.startsWith("*") || cron.weekdayField.startsWith("*")) return dayOfMonth && dayOfWeek;
  return dayOfMonth || dayOfWeek;
}

export function nextCronRuns(expression: string, from: Date, count = 5) {
  if (!Number.isFinite(from.getTime())) throw new Error("Invalid start time");
  const wanted = Math.min(12, Math.max(1, Math.round(count)));
  const cron = parseCron(expression);
  const start = new Date(from.getTime());
  start.setSeconds(0, 0);
  const origin = start.getTime() + 60_000;
  const results: Date[] = [];
  const originDate = new Date(origin);
  for (let dayOffset = 0; dayOffset < 366 * 8 && results.length < wanted; dayOffset += 1) {
    const day = new Date(originDate.getFullYear(), originDate.getMonth(), originDate.getDate() + dayOffset);
    if (!cron.month.includes(day.getMonth() + 1) || !matchesDay(day, cron)) continue;
    for (const hour of cron.hour) {
      for (const minute of cron.minute) {
        const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
        if (
          candidate.getFullYear() !== day.getFullYear()
          || candidate.getMonth() !== day.getMonth()
          || candidate.getDate() !== day.getDate()
          || candidate.getHours() !== hour
          || candidate.getMinutes() !== minute
          || candidate.getTime() < origin
        ) continue;
        results.push(candidate);
        if (results.length >= wanted) return results;
      }
    }
  }
  if (results.length === 0) throw new Error("No runs in the next 8 years");
  return results;
}
