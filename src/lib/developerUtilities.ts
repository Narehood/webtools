import {
  base64ToBytes,
  boundedText,
  bytesToBase64,
  escapeHtml,
} from "./utilityCore.ts";

export function basicAuth(user: string, password: string) {
  if (user.includes(":"))
    throw new Error("A Basic-auth username cannot contain a colon.");
  if (/[\r\n]/.test(user + password))
    throw new Error("Credentials cannot contain line breaks.");
  boundedText(user + password, 10000);
  return `Authorization: Basic ${bytesToBase64(new TextEncoder().encode(`${user}:${password}`))}`;
}
export function decodeBasicAuth(raw: string) {
  const value = raw
    .trim()
    .replace(/^Authorization:\s*/i, "")
    .replace(/^Basic\s+/i, "");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(
    base64ToBytes(value, 10000),
  );
  const index = text.indexOf(":");
  if (index < 0)
    throw new Error(
      "Basic credentials must contain a username and password separated by a colon.",
    );
  return `Username: ${text.slice(0, index)}\nPassword: ${text.slice(index + 1)}`;
}
export function decodeSafeLink(raw: string) {
  const url = new URL(boundedText(raw, 20000).trim());
  if (
    url.protocol !== "https:" ||
    !/(^|\.)safelinks\.protection\.outlook\.com$/i.test(url.hostname)
  )
    throw new Error("Enter an HTTPS Microsoft Outlook Safe Links URL.");
  const target = url.searchParams.get("url");
  if (!target) throw new Error("This Safe Link has no original URL parameter.");
  const original = new URL(target);
  if (!["http:", "https:"].includes(original.protocol))
    throw new Error("The original URL must use HTTP or HTTPS.");
  return original.href;
}
export function metaTags(values: Record<string, string>) {
  for (const value of Object.values(values)) boundedText(value, 5000);
  for (const key of ["url", "image"])
    if (values[key]) {
      const parsed = new URL(values[key]);
      if (!["http:", "https:"].includes(parsed.protocol))
        throw new Error(`${key} must be an HTTP(S) URL.`);
    }
  const fields = [
    ["name", "description", values.description],
    ["property", "og:type", values.type],
    ["property", "og:title", values.title],
    ["property", "og:description", values.description],
    ["property", "og:url", values.url],
    ["property", "og:image", values.image],
    ["property", "og:site_name", values.site],
    ["name", "twitter:card", values.card],
    ["name", "twitter:title", values.title],
    ["name", "twitter:description", values.description],
    ["name", "twitter:image", values.image],
  ];
  return `<title>${escapeHtml(values.title)}</title>\n${values.url ? `<link rel="canonical" href="${escapeHtml(values.url)}">\n` : ""}${fields
    .filter(([, , value]) => value)
    .map(
      ([attribute, key, value]) =>
        `<meta ${attribute}="${key}" content="${escapeHtml(value)}">`,
    )
    .join("\n")}`;
}
export function svgPlaceholder(
  width: string,
  height: string,
  label: string,
  background: string,
  foreground: string,
) {
  const w = Number(width),
    h = Number(height);
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 1 ||
    h < 1 ||
    w > 10000 ||
    h > 10000
  )
    throw new Error("Width and height must be integers from 1 to 10,000.");
  if (
    !/^#[0-9a-f]{6}$/i.test(background) ||
    !/^#[0-9a-f]{6}$/i.test(foreground)
  )
    throw new Error("Choose six-digit hex colors.");
  boundedText(label, 200);
  const text = label || `${w} × ${h}`;
  const fontSize = Math.max(
    1,
    Math.min(h / 5, w / (Array.from(text).length * 0.65), 160),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${background}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${foreground}" font-family="sans-serif" font-size="${fontSize}">${escapeHtml(text)}</text></svg>`;
}
