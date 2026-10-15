import { mkdir, writeFile } from "node:fs/promises";
import Papa from "papaparse";

const directory = new URL("../public/data/", import.meta.url);
await mkdir(directory, { recursive: true });
const updated = new Date().toISOString().slice(0, 10);
const sources = [
  "https://standards-oui.ieee.org/oui/oui.csv",
  "https://standards-oui.ieee.org/oui28/mam.csv",
  "https://standards-oui.ieee.org/oui36/oui36.csv",
];
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}
const results = await Promise.allSettled(sources.map(download));
const entries = {};
for (const [index, result] of results.entries()) {
  if (result.status === "rejected")
    throw new Error(`Registry download failed: ${sources[index]}`, {
      cause: result.reason,
    });
  const parsed = Papa.parse(result.value, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length)
    throw new Error(`Registry CSV could not be parsed: ${sources[index]}`);
  for (const row of parsed.data) {
    if (!/^[0-9A-F]{6,9}$/.test(row.Assignment) || !row["Organization Name"])
      throw new Error("Unexpected IEEE registry row.");
    entries[row.Assignment] = row["Organization Name"];
  }
}
if (Object.keys(entries).length < 40000)
  throw new Error("IEEE registry is unexpectedly small.");
await writeFile(
  new URL("mac-vendors.json", directory),
  JSON.stringify({ updated, sources, entries }),
);
console.log(`Saved ${Object.keys(entries).length} IEEE assignments.`);

const emojiSource = "https://unicode.org/Public/emoji/latest/emoji-test.txt";
const emojiText = await download(emojiSource);
let group = "";
const emojis = [];
for (const line of emojiText.split(/\r?\n/)) {
  if (line.startsWith("# group: ")) group = line.slice(9);
  const match =
    /^([A-F0-9 ]+)\s*; fully-qualified\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/.exec(
      line,
    );
  if (match)
    emojis.push({
      emoji: String.fromCodePoint(
        ...match[1]
          .trim()
          .split(/\s+/)
          .map((code) => parseInt(code, 16)),
      ),
      name: match[3],
      group,
    });
}
if (emojis.length < 3000)
  throw new Error("Unicode emoji data is unexpectedly small.");
await writeFile(
  new URL("emoji.json", directory),
  JSON.stringify({ updated, source: emojiSource, entries: emojis }),
);
console.log(`Saved ${emojis.length} Unicode emojis.`);
