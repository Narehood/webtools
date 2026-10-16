export function boundedText(text: string, max = 1_000_000) {
  if (text.length > max)
    throw new Error(`Input is limited to ${max.toLocaleString()} characters.`);
  return text;
}

export function integer(
  raw: string,
  min: number,
  max: number,
  label = "Value",
) {
  if (!/^-?\d+$/.test(raw.trim()))
    throw new Error(`${label} must be an integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

export function finiteNumber(
  raw: string,
  min = -Number.MAX_VALUE,
  label = "Value",
) {
  if (!raw.trim()) throw new Error(`Enter ${label.toLowerCase()}.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min)
    throw new Error(`${label} must be a finite number of at least ${min}.`);
  return value;
}

export function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function base64ToBytes(raw: string, maxBytes = 20 * 1024 * 1024) {
  const text = raw.replace(/\s/g, "");
  if (text.length > Math.ceil(maxBytes / 3) * 4)
    throw new Error("Decoded data is too large.");
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text))
    throw new Error("Enter valid, padded Base64.");
  const binary = atob(text);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (bytes.length > maxBytes || bytesToBase64(bytes) !== text)
    throw new Error("Invalid or oversized Base64.");
  return bytes;
}

export function randomInt(min: number, max: number) {
  const span = max - min + 1;
  if (
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(max) ||
    span < 1 ||
    span > 2 ** 32
  )
    throw new Error("Invalid random range.");
  const limit = Math.floor(2 ** 32 / span) * span;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return min + (buffer[0] % span);
}
