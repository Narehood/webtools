import { boundedText, integer } from "./utilityCore.ts";

const natoWords =
  "Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu".split(
    " ",
  );
export function toNato(text: string) {
  return Array.from(boundedText(text))
    .map((char) =>
      /[a-z]/i.test(char)
        ? natoWords[char.toUpperCase().charCodeAt(0) - 65]
        : char === " "
          ? "/"
          : char,
    )
    .join(" ");
}
export function textToBinary(text: string) {
  return Array.from(new TextEncoder().encode(boundedText(text)), (byte) =>
    byte.toString(2).padStart(8, "0"),
  ).join(" ");
}
export function binaryToText(raw: string) {
  const bits = boundedText(raw).replace(/\s/g, "");
  if (!/^[01]*$/.test(bits) || bits.length % 8)
    throw new Error(
      "Use groups of eight binary digits, optionally separated by whitespace.",
    );
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(bits.match(/.{8}/g) ?? [], (byte) => parseInt(byte, 2)),
  );
}
export function unicodeEscape(text: string) {
  return Array.from(boundedText(text), (char) => {
    const point = char.codePointAt(0)!;
    return point > 0xffff
      ? `\\u{${point.toString(16)}}`
      : `\\u${point.toString(16).padStart(4, "0")}`;
  }).join("");
}
export function unicodeUnescape(raw: string) {
  const text = boundedText(raw);
  if (/\\u(?!\{[0-9a-fA-F]{1,6}\}|[0-9a-fA-F]{4})/.test(text))
    throw new Error("Invalid Unicode escape. Use \\u0041 or \\u{1f600}.");
  return text.replace(
    /\\u(?:\{([0-9a-fA-F]{1,6})\}|([0-9a-fA-F]{4}))/g,
    (_, braced: string, fixed: string) => {
      const point = parseInt(braced ?? fixed, 16);
      if (point > 0x10ffff)
        throw new Error("Unicode code points cannot exceed U+10FFFF.");
      return String.fromCodePoint(point);
    },
  );
}
export function codePoints(text: string) {
  return Array.from(
    boundedText(text),
    (char) =>
      `${JSON.stringify(char)}  U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
  ).join("\n");
}
export function maskString(
  text: string,
  start: string,
  end: string,
  mask = "*",
) {
  const chars = Array.from(boundedText(text));
  const left = integer(start, 0, 10000, "Visible start");
  const right = integer(end, 0, 10000, "Visible end");
  if (Array.from(mask).length !== 1)
    throw new Error("Choose one mask character.");
  return chars
    .map((char, index) =>
      index < left || index >= chars.length - right ? char : mask,
    )
    .join("");
}
export function numeronyms(text: string) {
  return boundedText(text).replace(/\p{L}+/gu, (word) => {
    const chars = Array.from(word);
    return chars.length > 2
      ? `${chars[0]}${chars.length - 2}${chars[chars.length - 1]}`
      : word;
  });
}
export function normalizeEmailList(
  raw: string,
  aliases: boolean,
  deduplicate: boolean,
) {
  const emails = boundedText(raw)
    .split(/[\s,;]+/)
    .filter(Boolean);
  const result = emails.map((email) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw new Error(`Invalid email address: ${email}`);
    const index = email.lastIndexOf("@");
    let local = email.slice(0, index);
    let domain = email.slice(index + 1).toLowerCase();
    if (aliases && ["gmail.com", "googlemail.com"].includes(domain)) {
      domain = "gmail.com";
      local = local.toLowerCase().split("+")[0].replace(/\./g, "");
    }
    if (!local) throw new Error(`Email has an empty local part: ${email}`);
    return `${local}@${domain}`;
  });
  return (deduplicate ? [...new Set(result)] : result).join("\n");
}
export function convertList(raw: string, options: Record<string, string>) {
  let list = boundedText(raw).split(
    options.separator === "newline"
      ? /\r?\n/
      : options.separator === "comma"
        ? ","
        : options.separator === "tab"
          ? "\t"
          : /\s+/,
  );
  if (options.trim === "true") list = list.map((item) => item.trim());
  if (options.empty === "true") list = list.filter(Boolean);
  if (options.case === "lower") list = list.map((item) => item.toLowerCase());
  if (options.case === "upper") list = list.map((item) => item.toUpperCase());
  if (options.unique === "true") list = [...new Set(list)];
  if (options.sort === "true")
    list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (options.reverse === "true") list.reverse();
  const join =
    options.join === "newline"
      ? "\n"
      : options.join === "comma"
        ? ", "
        : options.join === "tab"
          ? "\t"
          : " ";
  return list
    .map((item) => `${options.prefix ?? ""}${item}${options.suffix ?? ""}`)
    .join(join);
}
const romanParts = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
] as const;
export function toRoman(raw: string) {
  let value = integer(raw, 1, 3999, "Number");
  let result = "";
  for (const [amount, numeral] of romanParts)
    while (value >= amount) {
      result += numeral;
      value -= amount;
    }
  return result;
}
export function fromRoman(raw: string) {
  const text = raw.trim().toUpperCase();
  if (
    !/^(?=.)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(text)
  )
    throw new Error("Enter a canonical Roman numeral from I to MMMCMXCIX.");
  let rest = text;
  let total = 0;
  for (const [amount, numeral] of romanParts)
    while (rest.startsWith(numeral)) {
      total += amount;
      rest = rest.slice(numeral.length);
    }
  return String(total);
}
