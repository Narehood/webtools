import { useMemo, useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import {
  aspectOf,
  convertBases,
  formatMeasure,
  formatNumber,
  loremIpsum,
  parseLooseNumber,
  percentChange,
  percentOfAmount,
  shareOfWhole,
  textStats,
  transformEncoded,
  transformLines,
  type EncodeMode,
} from "../../lib/toolbox";

export function CountTool() {
  const [text, setText] = useState("");
  const stats = useMemo(() => textStats(text), [text]);
  const rows = [
    ["Characters", stats.characters],
    ["Without spaces", stats.charactersNoSpaces],
    ["Words", stats.words],
    ["Lines", stats.lines],
    ["Paragraphs", stats.paragraphs],
    ["Sentences", stats.sentences],
    ["Reading time", stats.reading],
  ] as const;

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Text counter</h1>
        <p className="lede">Counts in this tab. Reading time assumes about 200 words a minute.</p>
      </header>
      <div className="workspace report">
        <label className="field panel">
          <span>Text</span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste a draft…" />
        </label>
        <section className="panel">
          <div className="stat-grid">
            {rows.map(([label, value]) => (
              <div className="stat" key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function BasesTool() {
  const [raw, setRaw] = useState("255");
  const [base, setBase] = useState(10);
  const result = useMemo(() => convertBases(raw, base), [raw, base]);
  const rows = "error" in result ? [] : [
    ["Binary", result.bin],
    ["Octal", result.oct],
    ["Decimal", result.dec],
    ["Hex", result.hex],
  ];

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Number bases</h1>
        <p className="lede">Prefixes 0b, 0o, and 0x override the selected base. Underscores are ignored.</p>
      </header>
      <div className="workspace report">
        <section className="panel stack">
          <label className="field">
            <span>Number</span>
            <input value={raw} onChange={(event) => setRaw(event.target.value)} spellCheck={false} />
          </label>
          <label className="field">
            <span>From base</span>
            <select value={base} onChange={(event) => setBase(Number(event.target.value))}>
              <option value={2}>Binary (2)</option>
              <option value={8}>Octal (8)</option>
              <option value={10}>Decimal (10)</option>
              <option value={16}>Hexadecimal (16)</option>
            </select>
          </label>
        </section>
        <section className="panel">
          {"error" in result ? (
            <p className="lede" role="alert">{result.error}</p>
          ) : (
            <div className="stack">
              {rows.map(([label, value]) => (
                <div className="convert-row static" key={label}>
                  <span>{label}</span>
                  <b className="wrap">{value}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export function EncodeTool() {
  const [text, setText] = useState("a+b/c?x=1&y=<tag>");
  const [mode, setMode] = useState<EncodeMode>("url-encode");
  const output = useMemo(() => {
    try {
      return { text: transformEncoded(text, mode), error: "" };
    } catch (err) {
      return { text: "", error: err instanceof Error ? err.message : "Could not decode that text" };
    }
  }, [text, mode]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Encode & decode</h1>
        <p className="lede">URL encoding and HTML entities. Decoding stays in this tab.</p>
      </header>
      <div className="workspace report">
        <section className="panel stack">
          <label className="field">
            <span>Mode</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as EncodeMode)}>
              <option value="url-encode">URL encode</option>
              <option value="url-decode">URL decode</option>
              <option value="html-encode">HTML encode</option>
              <option value="html-decode">HTML decode</option>
            </select>
          </label>
          <label className="field">
            <span>Input</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
          </label>
        </section>
        <section className="panel stack">
          {output.error ? <p className="lede" role="alert">{output.error}</p> : null}
          <label className="field">
            <span>Output</span>
            <textarea readOnly value={output.text} />
          </label>
          <CopyButton text={output.text} />
        </section>
      </div>
    </>
  );
}

export function LoremTool() {
  const [paragraphs, setParagraphs] = useState(3);
  const [sentences, setSentences] = useState(4);
  const text = useMemo(() => loremIpsum(paragraphs, sentences), [paragraphs, sentences]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Lorem ipsum</h1>
        <p className="lede">Placeholder copy generated in this tab. Up to 20 paragraphs and 20 sentences each.</p>
      </header>
      <div className="workspace report">
        <section className="panel stack">
          <label className="field">
            <span>Paragraphs</span>
            <input type="number" min={1} max={20} value={paragraphs} onChange={(event) => setParagraphs(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>Sentences each</span>
            <input type="number" min={1} max={20} value={sentences} onChange={(event) => setSentences(Number(event.target.value))} />
          </label>
        </section>
        <section className="panel stack">
          <label className="field">
            <span>Preview</span>
            <textarea readOnly value={text} />
          </label>
          <CopyButton text={text} />
        </section>
      </div>
    </>
  );
}

export function LinesTool() {
  const [text, setText] = useState("banana\napple\n  apple\ncarrot");
  const [trim, setTrim] = useState(true);
  const [unique, setUnique] = useState(true);
  const [sort, setSort] = useState(true);
  const [reverse, setReverse] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const output = useMemo(
    () => transformLines(text, { trim, unique, sort, reverse, numbers }),
    [text, trim, unique, sort, reverse, numbers],
  );

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Line tools</h1>
        <p className="lede">Applied in order: trim, unique, sort, reverse, then numbers.</p>
      </header>
      <div className="workspace report">
        <section className="panel stack">
          <div className="row">
            <Check label="Trim blanks" checked={trim} onChange={setTrim} />
            <Check label="Unique" checked={unique} onChange={setUnique} />
            <Check label="Sort" checked={sort} onChange={setSort} />
            <Check label="Reverse" checked={reverse} onChange={setReverse} />
            <Check label="Number" checked={numbers} onChange={setNumbers} />
          </div>
          <label className="field">
            <span>Lines</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
          </label>
        </section>
        <section className="panel stack">
          <label className="field">
            <span>Result</span>
            <textarea readOnly value={output} />
          </label>
          <CopyButton text={output} />
        </section>
      </div>
    </>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export function PercentTool() {
  const [percent, setPercent] = useState("15");
  const [whole, setWhole] = useState("80");
  const [part, setPart] = useState("12");
  const [of, setOf] = useState("80");
  const [from, setFrom] = useState("40");
  const [to, setTo] = useState("50");

  const ofAmount = pair(percent, whole, percentOfAmount);
  const share = pair(part, of, (left, right) => shareOfWhole(left, right));
  const changeLeft = parseLooseNumber(from);
  const changeRight = parseLooseNumber(to);
  const change = changeLeft != null && changeRight != null ? percentChange(changeLeft, changeRight) : null;

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Percentages</h1>
        <p className="lede">Three everyday calculations. A zero starting value has no percent change.</p>
      </header>
      <div className="workspace report">
        <section className="panel stack">
          <div className="sentence">
            <span>What is</span>
            <input aria-label="Percent" value={percent} onChange={(event) => setPercent(event.target.value)} inputMode="decimal" />
            <span>% of</span>
            <input aria-label="Whole amount" value={whole} onChange={(event) => setWhole(event.target.value)} inputMode="decimal" />
          </div>
          <p className="calc-result">{ofAmount == null ? "—" : formatNumber(ofAmount)}</p>
        </section>
        <section className="panel stack">
          <div className="sentence">
            <input aria-label="Part" value={part} onChange={(event) => setPart(event.target.value)} inputMode="decimal" />
            <span>is what percent of</span>
            <input aria-label="Whole" value={of} onChange={(event) => setOf(event.target.value)} inputMode="decimal" />
          </div>
          <p className="calc-result">{share == null ? "—" : `${formatNumber(share)}%`}</p>
        </section>
        <section className="panel stack">
          <div className="sentence">
            <span>Change from</span>
            <input aria-label="Starting value" value={from} onChange={(event) => setFrom(event.target.value)} inputMode="decimal" />
            <span>to</span>
            <input aria-label="Ending value" value={to} onChange={(event) => setTo(event.target.value)} inputMode="decimal" />
          </div>
          <p className="calc-result">{change ?? "—"}</p>
        </section>
      </div>
    </>
  );
}

function pair(leftRaw: string, rightRaw: string, compute: (left: number, right: number) => number | null) {
  const left = parseLooseNumber(leftRaw);
  const right = parseLooseNumber(rightRaw);
  if (left == null || right == null) return null;
  return compute(left, right);
}

export function AspectTool() {
  const [width, setWidth] = useState("1920");
  const [height, setHeight] = useState("1080");
  const [targetWidth, setTargetWidth] = useState("1280");
  const [targetHeight, setTargetHeight] = useState("720");
  const ratio = useMemo(() => {
    const w = parseLooseNumber(width);
    const h = parseLooseNumber(height);
    if (w == null || h == null) return null;
    return aspectOf(w, h);
  }, [width, height]);
  const scaledWidth = scale(width, height, targetWidth, true);
  const scaledHeight = scale(width, height, targetHeight, false);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Aspect ratio</h1>
        <p className="lede">Simplify a pixel size, then scale either side while keeping the ratio.</p>
      </header>
      <div className="workspace report">
        <section className="panel stack">
          <div className="sentence">
            <input aria-label="Width" value={width} onChange={(event) => setWidth(event.target.value)} inputMode="decimal" />
            <span>×</span>
            <input aria-label="Height" value={height} onChange={(event) => setHeight(event.target.value)} inputMode="decimal" />
          </div>
          <div className="stat-grid">
            <div className="stat">
              <span>Ratio</span>
              <b>{ratio ? `${ratio.width}:${ratio.height}` : "—"}</b>
            </div>
            <div className="stat">
              <span>Decimal</span>
              <b>{ratio ? formatMeasure(ratio.decimal) : "—"}</b>
            </div>
          </div>
        </section>
        <section className="panel stack">
          <div className="sentence">
            <span>Width</span>
            <input aria-label="Target width" value={targetWidth} onChange={(event) => setTargetWidth(event.target.value)} inputMode="decimal" />
            <span>→ height {scaledWidth ?? "—"}</span>
          </div>
          <div className="sentence">
            <span>Height</span>
            <input aria-label="Target height" value={targetHeight} onChange={(event) => setTargetHeight(event.target.value)} inputMode="decimal" />
            <span>→ width {scaledHeight ?? "—"}</span>
          </div>
        </section>
      </div>
    </>
  );
}

function scale(widthRaw: string, heightRaw: string, targetRaw: string, targetIsWidth: boolean) {
  const width = parseLooseNumber(widthRaw);
  const height = parseLooseNumber(heightRaw);
  const target = parseLooseNumber(targetRaw);
  if (width == null || height == null || target == null || width <= 0 || height <= 0 || target <= 0) return null;
  const value = targetIsWidth ? (height / width) * target : (width / height) * target;
  return formatMeasure(value);
}
