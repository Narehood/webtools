export type TextStats = {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  lines: number;
  paragraphs: number;
  sentences: number;
  reading: string;
};

export function textStats(text: string): TextStats {
  const characters = [...text].length;
  const charactersNoSpaces = [...text.replace(/\s/g, "")].length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text.length === 0 ? 0 : text.split(/\r\n|\n|\r/).length;
  const paragraphs = text.trim() ? text.trim().split(/\n\s*\n/).filter((part) => part.trim()).length : 0;
  const sentences = text.trim() ? (text.match(/[^.!?]+[.!?]+(\s|$)/g)?.length ?? (words ? 1 : 0)) : 0;
  return {
    characters,
    charactersNoSpaces,
    words,
    lines,
    paragraphs,
    sentences,
    reading: readingTime(words),
  };
}

function readingTime(words: number) {
  if (words <= 0) return "0 min";
  const minutes = words / 200;
  if (minutes < 1) return "< 1 min";
  return `${Math.max(1, Math.round(minutes))} min`;
}

const DIGITS = "0123456789abcdef";

export function convertBases(raw: string, from: number): { bin: string; oct: string; dec: string; hex: string } | { error: string } {
  let body = raw.trim().toLowerCase().replace(/_/g, "");
  if (!body) return { error: "Enter a number" };
  if (body.length > 4096) return { error: "That number is too long" };
  let negative = false;
  if (body.startsWith("-")) {
    negative = true;
    body = body.slice(1);
  } else if (body.startsWith("+")) {
    body = body.slice(1);
  }
  let base = from;
  if (body.startsWith("0b")) {
    body = body.slice(2);
    base = 2;
  } else if (body.startsWith("0o")) {
    body = body.slice(2);
    base = 8;
  } else if (body.startsWith("0x")) {
    body = body.slice(2);
    base = 16;
  }
  if (!body || base < 2 || base > 16) return { error: "Choose a base from 2 to 16" };
  let value = 0n;
  for (const char of body) {
    const digit = DIGITS.indexOf(char);
    if (digit < 0 || digit >= base) return { error: `“${char}” is not valid in base ${base}` };
    value = value * BigInt(base) + BigInt(digit);
  }
  if (negative) value = -value;
  return {
    bin: value.toString(2),
    oct: value.toString(8),
    dec: value.toString(10),
    hex: value.toString(16).toUpperCase(),
  };
}

export function encodeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

export function decodeHtml(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, digits: string) => safeCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => safeCodePoint(parseInt(digits, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return "";
  return String.fromCodePoint(value);
}

export type EncodeMode = "url-encode" | "url-decode" | "html-encode" | "html-decode";

export function transformEncoded(text: string, mode: EncodeMode) {
  switch (mode) {
    case "url-encode":
      return encodeURIComponent(text);
    case "url-decode":
      return decodeURIComponent(text.replace(/\+/g, " "));
    case "html-encode":
      return encodeHtml(text);
    case "html-decode":
      return decodeHtml(text);
  }
}

const LOREM = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "sed", "do",
  "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua", "enim",
  "ad", "minim", "veniam", "quis", "nostrud", "exercitation", "ullamco", "laboris", "nisi", "aliquip",
  "ex", "ea", "commodo", "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
  "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint", "occaecat", "cupidatat",
  "non", "proident", "sunt", "culpa", "qui", "officia", "deserunt", "mollit", "anim", "id", "est", "laborum",
];

function clampCount(value: number, max: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(1, Math.round(value)));
}

export function loremIpsum(paragraphs: number, sentences: number) {
  const paragraphCount = clampCount(paragraphs, 20);
  const sentenceCount = clampCount(sentences, 20);
  let cursor = 0;
  const blocks: string[] = [];
  for (let paragraph = 0; paragraph < paragraphCount; paragraph += 1) {
    const lines: string[] = [];
    for (let sentence = 0; sentence < sentenceCount; sentence += 1) {
      const length = 8 + ((paragraph + sentence) % 6);
      const words: string[] = [];
      for (let index = 0; index < length; index += 1) {
        words.push(LOREM[cursor % LOREM.length]);
        cursor += 1;
      }
      const text = `${words[0].charAt(0).toUpperCase()}${words[0].slice(1)} ${words.slice(1).join(" ")}.`;
      lines.push(paragraph === 0 && sentence === 0 ? "Lorem ipsum dolor sit amet, consectetur adipiscing elit." : text);
    }
    blocks.push(lines.join(" "));
  }
  return blocks.join("\n\n");
}

export type LineOptions = {
  trim: boolean;
  unique: boolean;
  sort: boolean;
  reverse: boolean;
  numbers: boolean;
};

export function transformLines(text: string, options: LineOptions) {
  let lines = text.split(/\r\n|\n|\r/);
  if (options.trim) lines = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  if (options.unique) lines = [...new Set(lines)];
  if (options.sort) lines = [...lines].sort((a, b) => a.localeCompare(b));
  if (options.reverse) lines = [...lines].reverse();
  if (options.numbers) lines = lines.map((line, index) => `${index + 1}. ${line}`);
  return lines.join("\n");
}

export function parseLooseNumber(raw: string) {
  const text = raw.trim().replace(/,/g, "").replace(/%$/, "");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function formatNumber(value: number) {
  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded);
}

export function percentOfAmount(percent: number, whole: number) {
  return (percent / 100) * whole;
}

export function shareOfWhole(part: number, whole: number) {
  if (whole === 0) return null;
  return (part / whole) * 100;
}

export function percentChange(from: number, to: number) {
  if (from === 0) return null;
  const value = ((to - from) / Math.abs(from)) * 100;
  const rounded = Math.round(value * 1000) / 1000;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

function gcd(a: number, b: number) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

export function aspectOf(width: number, height: number) {
  const w = Math.round(width);
  const h = Math.round(height);
  if (w <= 0 || h <= 0) return null;
  const divisor = gcd(w, h);
  return { width: w / divisor, height: h / divisor, decimal: w / h };
}

export function formatMeasure(value: number) {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}
