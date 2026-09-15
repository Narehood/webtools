import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrTool() {
  const [text, setText] = useState("https://localhost:5173");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(text || " ", { type: "svg", margin: 1, width: 220, color: { dark: "#1a1612", light: "#ffffff" } })
      .then((value) => {
        if (!cancelled) {
          setSvg(value);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSvg("");
          setError(err instanceof Error ? err.message : "Could not build QR");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [text]);
  const isSvg = svg.startsWith("<svg");

  function download() {
    if (!isSvg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "qr.svg";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>QR code</h1>
        <p className="lede">Drawn in this browser. No tracking pixel, no remote renderer.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Content</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={download} disabled={!isSvg}>
              Download SVG
            </button>
          </div>
        </section>
        <section className="panel paper">
          <h3>Preview</h3>
          <p className="lede">Keep it short for the densest scan.</p>
          {isSvg ? (
            <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <p>{error || "Building…"}</p>
          )}
        </section>
      </div>
    </>
  );
}

export function JsonTool() {
  const [input, setInput] = useState('{\n  "hello": "bench"\n}');
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  function format(minified = false) {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, minified ? 0 : 2));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>JSON formatter</h1>
        <p className="lede">Pretty-print or minify without sending the payload anywhere.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Input</span>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => format(false)}>
              Pretty print
            </button>
            <button className="btn ghost" onClick={() => format(true)}>
              Minify
            </button>
          </div>
          {error && <p className="lede">{error}</p>}
        </section>
        <section className="panel">
          <label className="field">
            <span>Output</span>
            <textarea readOnly value={output} />
          </label>
        </section>
      </div>
    </>
  );
}

export function ColorTool() {
  const [fg, setFg] = useState("#f3eee4");
  const [bg, setBg] = useState("#161412");

  const ratio = contrast(fg, bg);
  const passAA = ratio >= 4.5;
  const passAAA = ratio >= 7;

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Color contrast</h1>
        <p className="lede">WCAG 2 contrast for a foreground / background pair.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <div className="stack">
            <label className="field">
              <span>Foreground</span>
              <input type="color" value={fg} onChange={(event) => setFg(event.target.value)} />
              <input value={fg} onChange={(event) => setFg(event.target.value)} />
            </label>
            <label className="field">
              <span>Background</span>
              <input type="color" value={bg} onChange={(event) => setBg(event.target.value)} />
              <input value={bg} onChange={(event) => setBg(event.target.value)} />
            </label>
          </div>
        </section>
        <section className="panel">
          <div className="swatch" style={{ background: bg, color: fg, display: "grid", placeItems: "center", fontFamily: "var(--display)", fontSize: "1.8rem" }}>
            The quick brown fox
          </div>
          <div className="stat-grid" style={{ marginTop: 16 }}>
            <div className="stat">
              <span>Contrast</span>
              <b>{ratio.toFixed(2)} : 1</b>
            </div>
            <div className="stat">
              <span>WCAG</span>
              <b>{passAAA ? "AAA" : passAA ? "AA" : "Fail"}</b>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function hexToRgb(hex: string) {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const lin = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string) {
  try {
    const l1 = luminance(a);
    const l2 = luminance(b);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  } catch {
    return 0;
  }
}
