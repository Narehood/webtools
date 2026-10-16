import { useEffect, useState } from "react";
import {
  Utility,
  ToolFrame,
  type UtilityConfig,
} from "../../../components/Utility";
import { CopyButton } from "../../../components/CopyButton";
import {
  binaryToText,
  codePoints,
  convertList,
  maskString,
  normalizeEmailList,
  numeronyms,
  textToBinary,
  toNato,
  unicodeEscape,
  unicodeUnescape,
} from "../../../lib/textUtilities";
import { boundedText } from "../../../lib/utilityCore";

type Emoji = { emoji: string; name: string; group: string };
function EmojiPicker() {
  const [list, setList] = useState<Emoji[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Emoji | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/data/emoji.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Emoji data could not be loaded.");
        return response.json() as Promise<{ entries: Emoji[] }>;
      })
      .then((data) => setList(data.entries))
      .catch((err) => {
        if (!controller.signal.aborted) setError(String(err));
      });
    return () => controller.abort();
  }, []);
  const matches = list.filter((item) =>
    `${item.name} ${item.emoji} ${item.group}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <ToolFrame slug="emoji">
      <div className="panel stack">
        <label className="field">
          <span>Search emoji names and groups</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        {!list.length && !error && <p role="status">Loading emojis…</p>}
        {selected && (
          <div className="stat">
            <b>
              {selected.emoji} {selected.name}
            </b>
            <p className="lede">{codePoints(selected.emoji)}</p>
            <div className="row">
              <CopyButton text={selected.emoji} />
              <CopyButton
                text={codePoints(selected.emoji)}
                label="Copy code points"
              />
            </div>
          </div>
        )}
        <p className="lede">
          {matches.length} matches. Showing up to 300; search to narrow the
          list.
        </p>
        <div className="emoji-grid">
          {matches.slice(0, 300).map((item) => (
            <button
              className="emoji-choice"
              key={item.emoji}
              title={item.name}
              aria-label={item.name}
              onClick={() => setSelected(item)}
            >
              {item.emoji}
            </button>
          ))}
        </div>
      </div>
    </ToolFrame>
  );
}
async function ascii(text: string, font: string) {
  boundedText(text, 200);
  const [
    { default: figlet },
    { default: standard },
    { default: slant },
    { default: small },
  ] = await Promise.all([
    import("figlet"),
    import("figlet/fonts/Standard"),
    import("figlet/fonts/Slant"),
    import("figlet/fonts/Small"),
  ]);
  figlet.parseFont("Standard", standard);
  figlet.parseFont("Slant", slant);
  figlet.parseFont("Small", small);
  if (!/^[\x20-\x7e\r\n]*$/.test(text))
    throw new Error(
      "These fonts support ASCII text. Use characters from space through ~.",
    );
  return figlet.textSync(text, { font: font as "Standard" });
}
export default function TextWorkbench({ slug }: { slug: string }) {
  if (slug === "emoji") return <EmojiPicker />;
  const configs: Record<string, UtilityConfig> = {
    nato: {
      fields: [
        { key: "input", label: "Text", value: "WebTools", type: "textarea" },
      ],
      run: (v) => toNato(v.input),
    },
    binary: {
      fields: [
        {
          key: "input",
          label: "Text or binary bytes",
          value: "Hello 🌎",
          type: "textarea",
        },
      ],
      actions: ["Encode", "Decode"],
      run: (v, a) =>
        a === "Encode" ? textToBinary(v.input) : binaryToText(v.input),
      note: "Encode UTF-8 bytes as eight-bit binary groups, or decode binary bytes back to text. Invalid UTF-8 is reported.",
    },
    unicode: {
      fields: [
        {
          key: "input",
          label: "Text or Unicode escapes",
          value: "Hello 👋",
          type: "textarea",
        },
      ],
      actions: ["Escape", "Unescape", "Code points"],
      run: (v, a) =>
        a === "Escape"
          ? unicodeEscape(v.input)
          : a === "Unescape"
            ? unicodeUnescape(v.input)
            : codePoints(v.input),
    },
    list: {
      fields: [
        {
          key: "input",
          label: "List",
          value: "pear\napple\npear\nbanana",
          type: "textarea",
        },
        {
          key: "separator",
          label: "Input separator",
          value: "newline",
          options: ["newline", "comma", "tab", "whitespace"],
        },
        {
          key: "join",
          label: "Output separator",
          value: "comma",
          options: ["newline", "comma", "tab", "space"],
        },
        {
          key: "case",
          label: "Letter case",
          value: "keep",
          options: ["keep", "lower", "upper"],
        },
        { key: "prefix", label: "Prefix each item", value: "" },
        { key: "suffix", label: "Suffix each item", value: "" },
        ...[
          ["trim", "Trim whitespace", "true"],
          ["empty", "Remove empty items", "true"],
          ["unique", "Remove duplicates", "true"],
          ["sort", "Sort naturally", "false"],
          ["reverse", "Reverse order", "false"],
        ].map(([key, label, value]) => ({
          key,
          label,
          value,
          type: "checkbox" as const,
        })),
      ],
      run: (v) => convertList(v.input, v),
      filename: "list.txt",
    },
    "email-normalizer": {
      fields: [
        {
          key: "input",
          label: "Email addresses (lines, commas, or semicolons)",
          value: "Ada@example.com\nAda@example.com",
          type: "textarea",
        },
        {
          key: "aliases",
          label:
            "Normalize Gmail/googlemail dots, plus aliases, and local-part case",
          value: "false",
          type: "checkbox",
        },
        {
          key: "dedupe",
          label: "Remove duplicates",
          value: "true",
          type: "checkbox",
        },
      ],
      actions: ["Normalize"],
      run: (v) =>
        normalizeEmailList(v.input, v.aliases === "true", v.dedupe === "true"),
      note: "Always trim addresses and lowercase domains. Local parts retain case by default. Gmail alias handling is opt-in and applies only to gmail.com and googlemail.com; no mailbox existence checks are made.",
    },
    obfuscate: {
      fields: [
        {
          key: "input",
          label: "Text",
          value: "my-private-token-123456",
          type: "textarea",
        },
        {
          key: "start",
          label: "Visible characters at start",
          value: "3",
          type: "number",
        },
        {
          key: "end",
          label: "Visible characters at end",
          value: "4",
          type: "number",
        },
        { key: "mask", label: "Mask character", value: "*" },
      ],
      actions: ["Mask"],
      run: (v) => maskString(v.input, v.start, v.end, v.mask),
      note: "Mask text for sharing. Output keeps the original character count; this is redaction, not encryption.",
    },
    numeronym: {
      fields: [
        {
          key: "input",
          label: "Words",
          value: "internationalization localization accessibility",
          type: "textarea",
        },
      ],
      run: (v) => numeronyms(v.input),
    },
    ascii: {
      fields: [
        {
          key: "input",
          label: "ASCII text (up to 200 characters)",
          value: "WebTools",
          type: "textarea",
        },
        {
          key: "font",
          label: "Font",
          value: "Standard",
          options: ["Standard", "Slant", "Small"],
        },
      ],
      actions: ["Draw"],
      run: (v) => ascii(v.input, v.font),
      filename: "banner.txt",
    },
  };
  return <Utility slug={slug} config={configs[slug]} />;
}
