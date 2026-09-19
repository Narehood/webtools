import Papa from "papaparse";

export function csvToJson(text: string) {
  if (!text.trim()) return [];
  const parsed = Papa.parse<string[]>(text, { delimiter: ",", skipEmptyLines: false });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);
  // A terminal record separator is not an extra empty record. Quoted empty cells are.
  if (/[\r\n]$/.test(text) && parsed.data.at(-1)?.length === 1 && parsed.data.at(-1)?.[0] === "") parsed.data.pop();
  const [headers, ...rows] = parsed.data;
  if (!headers) return [];
  if (headers.some((header) => !header.trim())) throw new Error("CSV column names cannot be empty");
  if (new Set(headers).size !== headers.length) throw new Error("CSV column names must be unique");
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV record ${index + 2} has ${cells.length} fields; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
  });
}

export function jsonToCsv(value: unknown) {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.length === 0) return "";
  const records = rows.map((row): Record<string, unknown> =>
    row !== null && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : { value: row });
  const fields = [...new Set(records.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return Papa.unparse({ fields, data: records.map((row) => fields.map((key) => cell(row[key]))) });
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

export function uuidV4() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nanoId(length = 12) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

export function casesOf(input: string) {
  const words = input.normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
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
    kebab: words.join("-"),
    constant: words.join("_").toUpperCase(),
  };
}
