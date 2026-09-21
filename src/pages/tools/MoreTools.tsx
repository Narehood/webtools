import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CopyButton } from "../../components/CopyButton";
import { formatHex, formatHsl, formatRgb, parseColor } from "../../lib/colorValue";
import { hmacHex, type HmacAlgorithm } from "../../lib/hmac";
import { parseMarkdown, type Inline } from "../../lib/markdown";
import { makePassphrase, passphraseBits } from "../../lib/passphrase";
import { passphraseWords } from "../../lib/words";
import { commonZones, formatZoneTime, localZoneName } from "../../lib/zones";

function localStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ZonesTool() {
  const [stamp, setStamp] = useState(() => localStamp(new Date()));
  const [custom, setCustom] = useState("UTC+5:30");
  const localName = localZoneName();
  const instant = useMemo(() => (stamp ? new Date(stamp) : new Date("")), [stamp]);
  const zones = useMemo(() => {
    const names = [...new Set([localName, ...commonZones, custom.trim()].filter(Boolean))];
    return names.map((zone) => {
      try {
        return { zone, ...formatZoneTime(instant, zone), error: "" };
      } catch (error) {
        return { zone, label: zone, time: "", error: error instanceof Error ? error.message : "Unknown time zone" };
      }
    });
  }, [instant, localName, custom]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Time zones</h1>
        <p className="lede">
          One local time shown across common zones. Add an IANA name such as Europe/Berlin, or an offset such as UTC-5.
        </p>
      </header>
      <div className="workspace report">
        <section className="panel stack">
          <label className="field">
            <span>Local time</span>
            <input type="datetime-local" value={stamp} onChange={(event) => setStamp(event.target.value)} />
          </label>
          <div className="row">
            <button className="btn ghost" type="button" onClick={() => setStamp(localStamp(new Date()))}>
              Use now
            </button>
          </div>
          <label className="field">
            <span>Another zone or offset</span>
            <input value={custom} onChange={(event) => setCustom(event.target.value)} spellCheck={false} placeholder="Europe/Berlin or UTC-8" />
          </label>
        </section>
        <section className="panel">
          {Number.isNaN(instant.getTime()) ? (
            <p className="lede" role="alert">Enter a valid date and time.</p>
          ) : (
            <div className="stack">
              {zones.map((zone) => (
                <div className="convert-row static" key={zone.zone}>
                  <span>{zone.label}</span>
                  <b className="wrap">{zone.error || zone.time}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export function ColorConvertTool() {
  const [input, setInput] = useState("#1ea54c");
  const color = useMemo(() => parseColor(input), [input]);
  const picker = color ? formatHex(color) : "#1ea54c";

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Color converter</h1>
        <p className="lede">Hex, RGB, and HSL for the same color. Contrast checking stays on its own page.</p>
      </header>
      <div className="workspace report">
        <section className="panel stack">
          <label className="field">
            <span>Color</span>
            <input value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} placeholder="#1ea54c or rgb(30, 165, 76)" />
          </label>
          <label className="field">
            <span>Picker</span>
            <input type="color" value={picker} aria-label="Color picker" onChange={(event) => setInput(event.target.value)} />
          </label>
        </section>
        <section className="panel stack">
          {color ? (
            <>
              <div className="swatch" style={{ background: formatHex(color) }} />
              <ValueRow label="Hex" value={formatHex(color)} />
              <ValueRow label="RGB" value={formatRgb(color)} />
              <ValueRow label="HSL" value={formatHsl(color)} />
            </>
          ) : (
            <p className="lede" role="alert">Use hex, rgb(), or hsl().</p>
          )}
        </section>
      </div>
    </>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="convert-row static">
      <span>{label}</span>
      <b className="wrap">{value}</b>
    </div>
  );
}

const markdownSample = `# Field notes

A short **preview** with *emphasis*, \`code\`, and a [link](https://example.com).

- Stays in this tab
- No remote renderer

\`\`\`
hello
\`\`\`
`;

export function MarkdownTool() {
  const [source, setSource] = useState(markdownSample);
  const blocks = useMemo(() => parseMarkdown(source), [source]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Markdown preview</h1>
        <p className="lede">Headings, lists, emphasis, code, and http(s) or mailto links. HTML in the source is shown as text.</p>
      </header>
      <div className="workspace">
        <label className="field panel">
          <span>Markdown</span>
          <textarea value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} />
        </label>
        <section className="panel">
          <div className="markdown-preview">
            {blocks.map((block, index) => (
              <MarkdownBlock key={index} block={block} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function InlineText({ parts }: { parts: Inline[] }) {
  return parts.map((part, index) => {
    if (part.type === "strong") return <strong key={index}>{part.text}</strong>;
    if (part.type === "em") return <em key={index}>{part.text}</em>;
    if (part.type === "code") return <code key={index}>{part.text}</code>;
    if (part.type === "link") return <a key={index} href={part.href} target="_blank" rel="noreferrer">{part.text}</a>;
    return <span key={index}>{part.text}</span>;
  });
}

function MarkdownBlock({ block }: { block: ReturnType<typeof parseMarkdown>[number] }): ReactNode {
  if (block.type === "h") {
    if (block.level === 1) return <h1><InlineText parts={block.inlines} /></h1>;
    if (block.level === 2) return <h2><InlineText parts={block.inlines} /></h2>;
    return <h3><InlineText parts={block.inlines} /></h3>;
  }
  if (block.type === "ul") return <ul>{block.items.map((item, index) => <li key={index}><InlineText parts={item} /></li>)}</ul>;
  if (block.type === "ol") return <ol>{block.items.map((item, index) => <li key={index}><InlineText parts={item} /></li>)}</ol>;
  if (block.type === "quote") return <blockquote><InlineText parts={block.inlines} /></blockquote>;
  if (block.type === "code") return <pre><code>{block.text}</code></pre>;
  if (block.type === "hr") return <hr />;
  return <p><InlineText parts={block.inlines} /></p>;
}

export function PassphraseTool() {
  const [count, setCount] = useState(6);
  const [separator, setSeparator] = useState("-");
  const [roll, setRoll] = useState(0);
  const phrase = useMemo(() => makePassphrase(count, separator), [count, separator, roll]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Passphrase</h1>
        <p className="lede">
          {count} words from a list of {passphraseWords.length}. About {passphraseBits(count)} bits. Drawn with Web Crypto in this tab.
        </p>
      </header>
      <div className="workspace report">
        <section className="panel stack">
          <label className="field">
            <span>Words ({count})</span>
            <input className="range" type="range" min={3} max={12} value={count} onChange={(event) => setCount(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>Separator</span>
            <select value={separator} onChange={(event) => setSeparator(event.target.value)}>
              <option value="-">Hyphen</option>
              <option value=" ">Space</option>
              <option value=".">Period</option>
            </select>
          </label>
          <button className="btn" type="button" onClick={() => setRoll((value) => value + 1)}>
            New passphrase
          </button>
        </section>
        <section className="panel stack">
          <p className="calc-result phrase">{phrase}</p>
          <CopyButton text={phrase} />
        </section>
      </div>
    </>
  );
}

export function HmacTool() {
  const [message, setMessage] = useState("message");
  const [secret, setSecret] = useState("");
  const [algorithm, setAlgorithm] = useState<HmacAlgorithm>("SHA-256");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setOutput(hmacHex(message, secret, algorithm));
      setError("");
    } catch (err) {
      setOutput("");
      setError(err instanceof Error ? err.message : "Could not sign");
    }
  }, [message, secret, algorithm]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>HMAC</h1>
        <p className="lede">Message and secret stay in this tab. The result is hexadecimal.</p>
      </header>
      <div className="workspace report">
        <section className="panel stack">
          <label className="field">
            <span>Algorithm</span>
            <select value={algorithm} onChange={(event) => setAlgorithm(event.target.value as HmacAlgorithm)}>
              <option>SHA-256</option>
              <option>SHA-384</option>
              <option>SHA-512</option>
            </select>
          </label>
          <label className="field">
            <span>Secret</span>
            <input value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} spellCheck={false} />
          </label>
        </section>
        <section className="panel stack">
          {error ? <p className="lede" role="alert">{error}</p> : null}
          <label className="field">
            <span>HMAC</span>
            <textarea readOnly value={output} />
          </label>
          <CopyButton text={output} />
        </section>
      </div>
    </>
  );
}

type SiteFile = {
  name: string;
  url: string;
  status: number;
  ok: boolean;
  body: string;
  truncated: boolean;
  note?: string;
  error?: string;
};

export function SiteFilesTool() {
  const [domain, setDomain] = useState("example.com");
  const [files, setFiles] = useState<SiteFile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/site-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Lookup failed");
      setFiles((payload as { files: SiteFile[] }).files);
    } catch (err) {
      setFiles([]);
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge network">This server</span>
        <h1>Site files</h1>
        <p className="lede">Fetches robots.txt and security.txt from this machine, over HTTPS, and stays on the host you type.</p>
      </header>
      <div className="workspace report">
        <form className="panel" onSubmit={onSubmit}>
          <label className="field">
            <span>Domain</span>
            <input value={domain} onChange={(event) => setDomain(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>{busy ? "Fetching…" : "Fetch files"}</button>
          </div>
        </form>
        <section className="panel">
          {error && <p className="lede" role="alert">{error}</p>}
          {files.length ? (
            <div className="stack">
              {files.map((file) => (
                <article className="record-block" key={file.name}>
                  <h3>
                    {file.name}
                    <span>{file.status ? `HTTP ${file.status}` : "Unreachable"}</span>
                  </h3>
                  <p className="record-empty">{file.url}</p>
                  {file.error ? <p className="lede" role="alert">{file.error}</p> : null}
                  {file.note ? <p className="record-empty">{file.note}</p> : null}
                  {file.body ? <pre className="whois-block">{file.body}</pre> : !file.error && !file.note && <p className="record-empty">{file.ok ? "Empty file" : "Not found"}</p>}
                  {file.truncated ? <p className="record-empty">Showing the first 48 KB.</p> : null}
                </article>
              ))}
            </div>
          ) : (
            !error && <p className="lede">robots.txt, /.well-known/security.txt, and /security.txt land here.</p>
          )}
        </section>
      </div>
    </>
  );
}
