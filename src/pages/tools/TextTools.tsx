import { useMemo, useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import { cleanUrl } from "../../lib/url";
import { diffLines } from "../../lib/diff";
import { casesOf, nanoId, toSlug, uuidV4 } from "../../lib/text";
import { parseTimestamp, type TimestampUnit } from "../../lib/timestamp";

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
  const [left, setLeft] = useState("The toolbox is quiet.\nLeave the originals on disk.");
  const [right, setRight] = useState("The toolbox is yours.\nLeave the originals on disk.");
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
  const [title, setTitle] = useState("Everyday toolbox notes");
  const [ids, setIds] = useState(() => [uuidV4(), uuidV4(), nanoId()]);

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
              onClick={() => setIds([uuidV4(), uuidV4(), nanoId()])}
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
  const [unit, setUnit] = useState<TimestampUnit>("seconds");
  const result = useMemo(() => {
    try { return { date: parseTimestamp(raw, unit), error: "" }; }
    catch (err) { return { date: null, error: err instanceof Error ? err.message : "Could not parse timestamp" }; }
  }, [raw, unit]);
  const parsed = result.date;

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Timestamp</h1>
        <p className="lede">Unix seconds, milliseconds, or an ISO string — converted on this clock.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field" style={{ marginBottom: 12 }}>
            <span>Input format</span>
            <select value={unit} onChange={(event) => setUnit(event.target.value as TimestampUnit)}>
              <option value="seconds">Unix seconds</option>
              <option value="milliseconds">Unix milliseconds</option>
              <option value="iso">ISO date-time</option>
            </select>
          </label>
          <label className="field">
            <span>Unix or ISO</span>
            <input value={raw} onChange={(event) => setRaw(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => setRaw(unit === "iso" ? new Date().toISOString() : String(unit === "milliseconds" ? Date.now() : Math.floor(Date.now() / 1000)))}>
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
            <p role="alert" className="lede">{result.error}</p>
          )}
        </section>
      </div>
    </>
  );
}

export function CaseTool() {
  const [input, setInput] = useState("The everyday toolbox");
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
