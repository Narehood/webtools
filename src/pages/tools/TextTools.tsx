import { useMemo, useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import { cleanUrl } from "../../lib/url";
import { diffLines } from "../../lib/diff";
import { casesOf, nanoId, toSlug } from "../../lib/text";

export function UrlTool() {
  const [input, setInput] = useState(
    "https://example.com/article?utm_source=news&utm_medium=email&fbclid=IwAR123&id=42",
  );
  const result = useMemo(() => {
    try {
      return { ok: true as const, ...cleanUrl(input) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Could not clean" };
    }
  }, [input]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>URL cleaner</h1>
        <p className="lede">Drops campaign tags and click IDs. The original paste never leaves this tab.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Dirty URL</span>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} />
          </label>
        </section>
        <section className="panel">
          {result.ok ? (
            <div className="stack">
              <label className="field">
                <span>Clean URL</span>
                <textarea readOnly value={result.href} />
              </label>
              <div className="row">
                <CopyButton text={result.href} />
              </div>
              <p className="lede" style={{ marginBottom: 0 }}>
                Removed {result.removed.length ? result.removed.join(", ") : "nothing — already clean"}.
              </p>
            </div>
          ) : (
            <p className="lede">{result.message}</p>
          )}
        </section>
      </div>
    </>
  );
}

export function DiffTool() {
  const [left, setLeft] = useState("The bench is quiet.\nLeave the originals on disk.");
  const [right, setRight] = useState("The bench is yours.\nLeave the originals on disk.");
  const rows = useMemo(() => diffLines(left, right), [left, right]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Text diff</h1>
        <p className="lede">Line-by-line comparison in this browser. Green arrived, coral left.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Before</span>
            <textarea value={left} onChange={(event) => setLeft(event.target.value)} />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>After</span>
            <textarea value={right} onChange={(event) => setRight(event.target.value)} />
          </label>
        </section>
        <section className="panel">
          <div className="diff-list">
            {rows.map((row, index) => (
              <div key={`${row.type}-${index}`} className={`diff-line ${row.type}`}>
                <span>{row.type === "add" ? "+" : row.type === "del" ? "−" : "·"}</span>
                {row.text || " "}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function IdsTool() {
  const [title, setTitle] = useState("Everyday bench notes");
  const [ids, setIds] = useState(() => [crypto.randomUUID(), crypto.randomUUID(), nanoId()]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>UUID & slug</h1>
        <p className="lede">Fresh identifiers and a URL slug, drawn with Web Crypto.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Title to slug</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="btn"
              onClick={() => setIds([crypto.randomUUID(), crypto.randomUUID(), nanoId()])}
            >
              New IDs
            </button>
          </div>
        </section>
        <section className="panel">
          <div className="stack">
            <div className="stat">
              <span>Slug</span>
              <b className="wrap">{toSlug(title) || "—"}</b>
            </div>
            {ids.map((id) => (
              <div className="stat" key={id}>
                <span>ID</span>
                <b className="wrap">{id}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function TimestampTool() {
  const now = Date.now();
  const [raw, setRaw] = useState(String(Math.floor(now / 1000)));
  const parsed = useMemo(() => {
    const value = raw.trim();
    if (!value) return null;
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && /^\d+(\.\d+)?$/.test(value)) {
      const ms = asNumber > 1e12 ? asNumber : asNumber * 1000;
      return new Date(ms);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [raw]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Timestamp</h1>
        <p className="lede">Unix seconds, milliseconds, or an ISO string — converted on this clock.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Unix or ISO</span>
            <input value={raw} onChange={(event) => setRaw(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => setRaw(String(Math.floor(Date.now() / 1000)))}>
              Use now
            </button>
          </div>
        </section>
        <section className="panel">
          {parsed ? (
            <div className="stat-grid">
              <div className="stat">
                <span>Local</span>
                <b>{parsed.toLocaleString()}</b>
              </div>
              <div className="stat">
                <span>ISO</span>
                <b className="wrap">{parsed.toISOString()}</b>
              </div>
              <div className="stat">
                <span>Seconds</span>
                <b>{Math.floor(parsed.getTime() / 1000)}</b>
              </div>
              <div className="stat">
                <span>Milliseconds</span>
                <b>{parsed.getTime()}</b>
              </div>
            </div>
          ) : (
            <p className="lede">Could not parse that timestamp.</p>
          )}
        </section>
      </div>
    </>
  );
}

export function CaseTool() {
  const [input, setInput] = useState("The everyday bench");
  const out = casesOf(input);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Case converter</h1>
        <p className="lede">One paste, every common identifier style.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Input</span>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} />
          </label>
        </section>
        <section className="panel">
          <div className="stack">
            {Object.entries(out).map(([name, value]) => (
              <div className="stat" key={name}>
                <span>{name}</span>
                <b className="wrap">{value || "—"}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
