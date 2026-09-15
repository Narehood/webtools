const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function expand(field: string, min: number, max: number) {
  if (field === "*") return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const values = new Set<number>();
  for (const piece of field.split(",")) {
    const [range, stepRaw] = piece.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (range === "*") {
      for (let n = min; n <= max; n += step) values.add(n);
      continue;
    }
    const [startRaw, endRaw] = range.split("-");
    const start = Number(startRaw);
    const end = endRaw ? Number(endRaw) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`Bad field: ${field}`);
    for (let n = start; n <= end; n += step) {
      if (n >= min && n <= max) values.add(n);
    }
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
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("Use a five-field cron: minute hour day month weekday");
  const minute = expand(parts[0], 0, 59);
  const hour = expand(parts[1], 0, 23);
  const day = expand(parts[2], 1, 31);
  const month = expand(parts[3], 1, 12);
  const weekday = expand(parts[4], 0, 6);

  const bits = [
    describe(minute, 60, "minute"),
    describe(hour, 24, "hour"),
    parts[2] === "*" ? "every day of the month" : describe(day, 31, "day"),
    parts[3] === "*" ? "every month" : describe(month, 12, "month", [ "", ...MONTHS ]),
    parts[4] === "*" ? "every weekday" : describe(weekday, 7, "weekday", WEEKDAYS),
  ];

  return `At ${bits[0]}, during ${bits[1]}, on ${bits[2]}, in ${bits[3]}, on ${bits[4]}.`;
}
