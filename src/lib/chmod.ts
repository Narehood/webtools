export type ChmodBits = {
  owner: { r: boolean; w: boolean; x: boolean };
  group: { r: boolean; w: boolean; x: boolean };
  other: { r: boolean; w: boolean; x: boolean };
  setuid: boolean;
  setgid: boolean;
  sticky: boolean;
};

const defaultBits: ChmodBits = {
  owner: { r: true, w: true, x: true },
  group: { r: true, w: false, x: true },
  other: { r: true, w: false, x: true },
  setuid: false,
  setgid: false,
  sticky: false,
};

function trioValue(trio: ChmodBits["owner"]) {
  return (trio.r ? 4 : 0) + (trio.w ? 2 : 0) + (trio.x ? 1 : 0);
}

function trioFrom(value: number): ChmodBits["owner"] {
  return { r: (value & 4) !== 0, w: (value & 2) !== 0, x: (value & 1) !== 0 };
}

function letter(trio: ChmodBits["owner"], extra: "s" | "t" | "" = "") {
  const r = trio.r ? "r" : "-";
  const w = trio.w ? "w" : "-";
  if (extra === "s") return `${r}${w}${trio.x ? "s" : "S"}`;
  if (extra === "t") return `${r}${w}${trio.x ? "t" : "T"}`;
  return `${r}${w}${trio.x ? "x" : "-"}`;
}

export function emptyChmod(): ChmodBits {
  return {
    owner: { ...defaultBits.owner },
    group: { ...defaultBits.group },
    other: { ...defaultBits.other },
    setuid: false,
    setgid: false,
    sticky: false,
  };
}

export function chmodToOctal(bits: ChmodBits) {
  const special = (bits.setuid ? 4 : 0) + (bits.setgid ? 2 : 0) + (bits.sticky ? 1 : 0);
  const body = `${trioValue(bits.owner)}${trioValue(bits.group)}${trioValue(bits.other)}`;
  return special ? `${special}${body}` : body;
}

export function chmodToSymbolic(bits: ChmodBits) {
  return letter(bits.owner, bits.setuid ? "s" : "") + letter(bits.group, bits.setgid ? "s" : "") + letter(bits.other, bits.sticky ? "t" : "");
}

export function chmodFromOctal(raw: string): ChmodBits {
  const digits = raw.trim();
  if (!/^[0-7]{3,4}$/.test(digits)) throw new Error("Octal chmod is 3 or 4 digits, like 755 or 0755");
  const padded = digits.padStart(4, "0");
  const special = Number(padded[0]);
  return {
    owner: trioFrom(Number(padded[1])),
    group: trioFrom(Number(padded[2])),
    other: trioFrom(Number(padded[3])),
    setuid: (special & 4) !== 0,
    setgid: (special & 2) !== 0,
    sticky: (special & 1) !== 0,
  };
}
