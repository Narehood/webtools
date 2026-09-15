function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

export function csvToJson(text: string) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim().length);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim() || "column");
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

export function jsonToCsv(value: unknown) {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.length === 0) return "";
  const keys = [...new Set(rows.flatMap((row) => (row && typeof row === "object" ? Object.keys(row) : ["value"])))];
  const escape = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell);
  const lines = [
    keys.join(","),
    ...rows.map((row) => {
      if (!row || typeof row !== "object") return escape(String(row));
      return keys.map((key) => escape(String((row as Record<string, unknown>)[key] ?? ""))).join(",");
    }),
  ];
  return lines.join("\n");
}

export function toSlug(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function nanoId(length = 12) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

export function casesOf(input: string) {
  const slug = toSlug(input);
  const words = slug.split("-").filter(Boolean);
  const camel = words.map((word, index) => (index === 0 ? word : word[0].toUpperCase() + word.slice(1))).join("");
  const pascal = words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
  return {
    original: input,
    lower: input.toLowerCase(),
    upper: input.toUpperCase(),
    title: words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" "),
    camel,
    pascal,
    snake: words.join("_"),
    kebab: slug,
    constant: words.join("_").toUpperCase(),
  };
}
