const alphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/";

export function convertIntegerBase(raw: string, from: number, to: number) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 2 ||
    from > 64 ||
    to < 2 ||
    to > 64
  )
    throw new Error("Choose integer bases from 2 to 64.");
  let text = raw.trim();
  if (!text || text.length > 4096)
    throw new Error("Enter an integer up to 4096 characters.");
  const negative = text.startsWith("-");
  if (negative) text = text.slice(1);
  else if (text.startsWith("+") && from <= 36) text = text.slice(1);
  if (/^0[bBoOxX]/.test(text) && from <= 36) {
    from =
      text[1].toLowerCase() === "b"
        ? 2
        : text[1].toLowerCase() === "o"
          ? 8
          : 16;
    text = text.slice(2);
  }
  if (from <= 36) text = text.toUpperCase().replace(/_/g, "");
  if (!text) throw new Error("Enter an integer.");
  let value = 0n;
  for (const char of text) {
    const digit = alphabet.indexOf(char);
    if (digit < 0 || digit >= from)
      throw new Error(`“${char}” is not a digit in base ${from}.`);
    value = value * BigInt(from) + BigInt(digit);
  }
  if (value === 0n) return "0";
  let result = "";
  const base = BigInt(to);
  while (value > 0n) {
    result = alphabet[Number(value % base)] + result;
    value /= base;
  }
  return negative ? `-${result}` : result;
}
