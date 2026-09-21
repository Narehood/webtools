export type WhoisRow = { label: string; value: string };
export type WhoisSection = { title: string; rows: WhoisRow[]; raw: string };

const SKIP = new Set(["text", "raw", "__raw", "dataerror"]);

const PRIORITY = [
  "Domain Name",
  "Domain",
  "Registry Domain ID",
  "Registrar",
  "Registrar URL",
  "Registrar IANA ID",
  "Creation Date",
  "Created Date",
  "Updated Date",
  "Expiry Date",
  "Registry Expiry Date",
  "Registrar Registration Expiration Date",
  "Domain Status",
  "Status",
  "Name Server",
  "Nameservers",
  "DNSSEC",
  "Registrant Organization",
  "Registrant Name",
  "Registrant Country",
  "Registrant Email",
];

function labelOf(key: string) {
  return key.replace(/[_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join("\n");
  return "";
}

export function formatWhoisDate(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return value;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return value;
  const date = new Date(parsed);
  const day = date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
  return `${day}, ${time} UTC`.replace(/\u202f/g, " ");
}

function displayValue(key: string, value: string) {
  if (!/date|expir/i.test(key)) return value;
  return value.split("\n").map(formatWhoisDate).join("\n");
}

function priorityOf(label: string) {
  const index = PRIORITY.findIndex((item) => item.toLowerCase() === label.toLowerCase());
  return index === -1 ? PRIORITY.length : index;
}

function collect(value: unknown, prefix: string, depth: number, rows: WhoisRow[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SKIP.has(key.toLowerCase())) continue;
    const label = prefix ? `${prefix} · ${labelOf(key)}` : labelOf(key);
    if (child && typeof child === "object" && !Array.isArray(child)) {
      collect(child, label, depth + 1, rows);
      continue;
    }
    const text = formatValue(child);
    if (text) rows.push({ label, value: displayValue(key, text) });
  }
}

export function whoisSections(result: Record<string, unknown>): WhoisSection[] {
  const sections: WhoisSection[] = [];
  for (const [server, record] of Object.entries(result)) {
    if (typeof record === "string" && record.trim()) {
      sections.push({ title: server, rows: [{ label: "Note", value: record.trim() }], raw: "" });
      continue;
    }
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const source = record as Record<string, unknown>;
    const rows: WhoisRow[] = [];
    collect(source, "", 0, rows);
    rows.sort((a, b) => priorityOf(a.label) - priorityOf(b.label) || a.label.localeCompare(b.label));
    const raw = typeof source.text === "string" ? source.text.trim() : "";
    if (rows.length || raw) sections.push({ title: server, rows, raw });
  }
  return sections;
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function whoisHighlights(result: Record<string, unknown>) {
  const rows = whoisSections(result).flatMap((section) => section.rows);
  const pick = (pattern: RegExp) => rows.find((row) => pattern.test(row.label))?.value.split("\n")[0] ?? "";
  const all = (pattern: RegExp) =>
    unique(rows.filter((row) => pattern.test(row.label)).flatMap((row) => row.value.split("\n").map((item) => item.trim())).filter(Boolean));
  return {
    domain: pick(/^domain name$/i) || pick(/^domain$/i),
    registrar: pick(/^registrar$/i),
    created: pick(/creat/i),
    updated: pick(/updated date/i),
    expires: pick(/expir/i),
    dnssec: pick(/^dnssec$/i),
    statuses: all(/status/i),
    nameservers: all(/name ?servers?$/i),
  };
}

export function whoisPlainText(sections: WhoisSection[]) {
  return sections
    .map((section) => {
      const body = section.rows.map((row) => `${row.label}: ${row.value.replace(/\n/g, ", ")}`).join("\n");
      return body ? `${section.title}\n${body}` : section.title;
    })
    .join("\n\n");
}
