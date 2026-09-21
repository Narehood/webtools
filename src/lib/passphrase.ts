import { passphraseWords } from "./words.ts";

export function passphraseBits(count: number, listSize = passphraseWords.length) {
  if (count < 1 || listSize < 2) return 0;
  return Math.floor(count * Math.log2(listSize));
}

function randomIndex(size: number) {
  const limit = Math.floor(0x1_0000_0000 / size) * size;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % size;
}

export function makePassphrase(count: number, separator: string, words = passphraseWords) {
  const size = Math.min(12, Math.max(3, Math.round(count)));
  if (words.length < 2) throw new Error("Word list is too short");
  const picked: string[] = [];
  for (let index = 0; index < size; index += 1) picked.push(words[randomIndex(words.length)]);
  return picked.join(separator);
}
