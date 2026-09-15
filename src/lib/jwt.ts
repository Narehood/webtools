function decodePart(part: string) {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export function peekJwt(token: string) {
  const trimmed = token.trim();
  const parts = trimmed.split(".");
  if (parts.length < 2) throw new Error("That does not look like a JWT");
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  return {
    header,
    payload,
    signature: parts[2] ?? "",
    parts: parts.length,
  };
}
