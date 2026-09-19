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

export function explainCron(expression: string) {
  if (expression.length > 512) throw new Error("Cron expression is too long");
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("Use a five-field cron: minute hour day month weekday");
  const minute = expand(parts[0], 0, 59);
  const hour = expand(parts[1], 0, 23);
  const day = expand(parts[2], 1, 31);
  const month = expand(parts[3], 1, 12, MONTHS);
  const weekday = [...new Set(expand(parts[4], 0, 7, WEEKDAYS).map((value) => value % 7))].sort((a, b) => a - b);
  const dayText = describe(day, 31, "day of the month");
  const weekdayText = describe(weekday, 7, "day of the week", WEEKDAYS);
  // Traditional five-field cron uses OR when both day fields are restricted.
  const days = parts[2] === "*" ? weekdayText : parts[4] === "*" ? dayText
    : `${dayText} ${parts[2].startsWith("*") || parts[4].startsWith("*") ? "and" : "or"} ${weekdayText}`;
  return `At ${describe(minute, 60, "minute")}, during ${describe(hour, 24, "hour")}, on ${days}, in ${describe(month, 12, "month", ["", ...MONTHS])}.`;
}
