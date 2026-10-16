import { useRef, useState } from "react";
import UAParser from "ua-parser-js";
import mimeDb from "mime-db";
import {
  Utility,
  ToolFrame,
  saveFile,
  type UtilityConfig,
} from "../../../components/Utility";
import { CopyButton } from "../../../components/CopyButton";
import {
  basicAuth,
  decodeBasicAuth,
  decodeSafeLink,
  metaTags,
} from "../../../lib/developerUtilities";
import { benchmarkStats } from "../../../lib/mathEvaluator";
import { boundedText } from "../../../lib/utilityCore";
import {
  gitReference,
  httpCodes,
  regexReference,
  type ReferenceRow,
} from "../../../data/references";

function Reference({
  slug,
  rows,
  source,
}: {
  slug: string;
  rows: ReferenceRow[];
  source: string;
}) {
  const [query, setQuery] = useState("");
  const matches = rows.filter((row) =>
    row.join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <ToolFrame slug={slug}>
      <div className="panel stack">
        <label className="field">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p className="lede">
          {matches.length} entries ·{" "}
          <a href={source} target="_blank" rel="noreferrer">
            Official reference
          </a>
        </p>
        {matches.map(([group, command, description]) => (
          <article className="stat reference-row" key={`${group}-${command}`}>
            <span>{group}</span>
            <code>{command}</code>
            <p>{description}</p>
            {slug !== "http-codes" && <CopyButton text={command} />}
          </article>
        ))}
        {!matches.length && <p>No matching entries.</p>}
      </div>
    </ToolFrame>
  );
}

function cleanRichHtml(raw: string) {
  const document = new DOMParser().parseFromString(
    boundedText(raw, 200_000),
    "text/html",
  );
  const allowed = new Set([
    "P",
    "BR",
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "S",
    "H1",
    "H2",
    "H3",
    "UL",
    "OL",
    "LI",
    "BLOCKQUOTE",
    "PRE",
    "CODE",
    "A",
    "DIV",
    "SPAN",
  ]);
  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    if (
      [
        "SCRIPT",
        "STYLE",
        "IFRAME",
        "OBJECT",
        "EMBED",
        "SVG",
        "MATH",
        "TEMPLATE",
      ].includes(element.tagName)
    ) {
      element.remove();
      continue;
    }
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      if (
        element.tagName === "A" &&
        attribute.name === "href" &&
        /^(https?:|mailto:)/i.test(attribute.value)
      )
        continue;
      element.removeAttribute(attribute.name);
    }
  }
  return document.body.innerHTML;
}
function HtmlEditor() {
  const [source, setSource] = useState(
    "<h2>Write something</h2><p>Edit this HTML, or use the rich text editor.</p>",
  );
  const [error, setError] = useState("");
  const editor = useRef<HTMLDivElement>(null);
  function load() {
    try {
      if (editor.current) editor.current.innerHTML = cleanRichHtml(source);
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }
  function format(command: string) {
    editor.current?.focus();
    document.execCommand(command);
    if (editor.current) setSource(editor.current.innerHTML);
  }
  return (
    <ToolFrame
      slug="html-editor"
      note="Edit HTML source, or load it into a basic rich text editor. The preview is sandboxed with scripts, forms, and external requests disabled. Rich editing keeps a safe subset of formatting."
    >
      <div className="workspace">
        <section className="panel stack">
          <label className="field">
            <span>HTML source</span>
            <textarea
              value={source}
              spellCheck={false}
              maxLength={200_000}
              onChange={(event) => setSource(event.target.value)}
            />
          </label>
          <div className="row">
            <button className="btn" onClick={load}>
              Load into rich editor
            </button>
            <CopyButton text={source} />
            <button
              className="btn ghost"
              onClick={() =>
                saveFile(source, "document.html", "text/html;charset=utf-8")
              }
            >
              Download HTML
            </button>
          </div>
          <div className="row" role="toolbar" aria-label="Text formatting">
            {[
              ["bold", "Bold"],
              ["italic", "Italic"],
              ["underline", "Underline"],
              ["insertUnorderedList", "Bullets"],
              ["insertOrderedList", "Numbers"],
            ].map(([command, label]) => (
              <button
                className="btn ghost"
                key={command}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => format(command)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            ref={editor}
            className="rich-editor"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="Rich text editor"
            aria-multiline="true"
            onInput={() => {
              if (editor.current) setSource(editor.current.innerHTML);
            }}
            onPaste={(event) => {
              event.preventDefault();
              document.execCommand(
                "insertText",
                false,
                event.clipboardData.getData("text/plain"),
              );
            }}
          >
            Edit rich text here, or load the HTML source above.
          </div>
          {error && <p role="alert">{error}</p>}
        </section>
        <section className="panel stack">
          <h2>Preview</h2>
          <iframe
            className="html-preview"
            title="Sandboxed HTML preview"
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><style>body{font:16px/1.5 system-ui;padding:16px;overflow-wrap:anywhere}pre{white-space:pre-wrap}</style></head><body>${source}</body></html>`}
          />
        </section>
      </div>
    </ToolFrame>
  );
}
function mimeLookup(query: string) {
  const text = query.trim().toLowerCase();
  if (!text) throw new Error("Enter a media type, extension, or filename.");
  const extension = text.includes(".") ? text.split(".").at(-1) : text;
  const entries = Object.entries(mimeDb).filter(
    ([type, info]) =>
      type.includes(text) ||
      (extension && info.extensions?.includes(extension)),
  );
  if (!entries.length)
    return "No matching registered media types in the bundled mime-db snapshot.";
  return (
    entries
      .slice(0, 100)
      .map(
        ([type, info]) =>
          `${type}\n  Extensions: ${info.extensions?.map((ext) => `.${ext}`).join(", ") || "not listed"}\n  Source: ${info.source || "unspecified"}${info.charset ? `\n  Charset: ${info.charset}` : ""}`,
      )
      .join("\n\n") +
    (entries.length > 100
      ? `\n\n${entries.length} matches; narrow the query to see more.`
      : "")
  );
}
function benchmark(values: Record<string, string>) {
  const a = benchmarkStats(values.a),
    b = benchmarkStats(values.b);
  const format = (name: string, result: ReturnType<typeof benchmarkStats>) =>
    `${name}\n${Object.entries(result)
      .map(
        ([key, value]) =>
          `${key}: ${Number(value.toFixed(6))}${key === "count" ? "" : " ms"}`,
      )
      .join("\n")}`;
  return `${format(values.nameA, a)}\n\n${format(values.nameB, b)}\n\n${a.mean === b.mean ? "Mean times are equal." : `${a.mean < b.mean ? values.nameA : values.nameB} has the lower mean.`}\n${Math.min(a.mean, b.mean) > 0 ? `Ratio of mean times: ${(Math.max(a.mean, b.mean) / Math.min(a.mean, b.mean)).toFixed(3)}×` : "A zero mean prevents a finite time-ratio comparison."}\n\nThese are descriptive statistics of the supplied timings; no significance or causality is inferred.`;
}
export default function DeveloperWorkbench({ slug }: { slug: string }) {
  if (slug === "html-editor") return <HtmlEditor />;
  if (slug === "git-reference")
    return (
      <Reference
        slug={slug}
        rows={gitReference}
        source="https://git-scm.com/docs"
      />
    );
  if (slug === "regex-reference")
    return (
      <Reference
        slug={slug}
        rows={regexReference}
        source="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Cheatsheet"
      />
    );
  if (slug === "http-codes")
    return (
      <Reference
        slug={slug}
        rows={httpCodes}
        source="https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml"
      />
    );
  const configs: Record<string, UtilityConfig> = {
    "basic-auth": {
      fields: [
        { key: "user", label: "Username", value: "admin" },
        { key: "password", label: "Password", value: "", type: "password" },
        {
          key: "header",
          label: "Existing Basic header (for decoding)",
          value: "",
          type: "textarea",
        },
      ],
      actions: ["Generate", "Decode"],
      run: (v, a) =>
        a === "Generate"
          ? basicAuth(v.user, v.password)
          : decodeBasicAuth(v.header),
      note: "Build or decode a UTF-8 HTTP Basic Authorization header. Basic authentication uses Base64 encoding; use HTTPS when sending it.",
    },
    "meta-tags": {
      fields: [
        { key: "title", label: "Page title", value: "WebTools" },
        {
          key: "description",
          label: "Description",
          value: "Handy tools for everyday work.",
          type: "textarea",
        },
        {
          key: "url",
          label: "Canonical page URL",
          value: "https://example.com/",
        },
        { key: "image", label: "Social preview image URL", value: "" },
        { key: "site", label: "Site name", value: "WebTools" },
        {
          key: "type",
          label: "Open Graph type",
          value: "website",
          options: ["website", "article", "profile"],
        },
        {
          key: "card",
          label: "Twitter/X card",
          value: "summary_large_image",
          options: ["summary", "summary_large_image"],
        },
      ],
      actions: ["Generate"],
      run: (v) => metaTags(v),
      filename: "meta-tags.html",
    },
    mime: {
      fields: [
        {
          key: "input",
          label: "MIME type, extension, or filename",
          value: "photo.jpg",
        },
      ],
      actions: ["Find"],
      run: (v) => mimeLookup(v.input),
    },
    "user-agent": {
      fields: [
        {
          key: "input",
          label: "User-agent string",
          value: navigator.userAgent,
          type: "textarea",
        },
      ],
      actions: ["Parse"],
      run: (v) =>
        JSON.stringify(
          new UAParser(boundedText(v.input, 5000)).getResult(),
          null,
          2,
        ),
      note: "Parse browser, engine, operating system, CPU, and device hints from a user-agent string. User agents may be reduced, spoofed, or unknown to this parser.",
    },
    safelink: {
      fields: [
        {
          key: "input",
          label: "Outlook Safe Link",
          value: "",
          type: "textarea",
        },
      ],
      actions: ["Decode"],
      run: (v) => decodeSafeLink(v.input),
      note: "Extract the HTTP(S) destination encoded in a Microsoft Outlook Safe Link. The destination is shown as text and is not opened.",
    },
    benchmark: {
      fields: [
        { key: "nameA", label: "First task", value: "Task A" },
        {
          key: "a",
          label: "Task A timings in milliseconds (spaces, commas, or lines)",
          value: "12, 14, 13, 12, 15",
          type: "textarea",
        },
        { key: "nameB", label: "Second task", value: "Task B" },
        {
          key: "b",
          label: "Task B timings in milliseconds",
          value: "9, 10, 11, 9, 10",
          type: "textarea",
        },
      ],
      actions: ["Compare"],
      run: (v) => benchmark(v),
    },
  };
  return <Utility slug={slug} config={configs[slug]} />;
}
