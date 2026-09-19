import { useState } from "react";
import { hashText } from "../../lib/hash";
import { CopyButton } from "../../components/CopyButton";

export function HashTool() {
  const [input, setInput] = useState("webtools");
  const [algo, setAlgo] = useState("SHA-256");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  function run() {
    try {
      setOutput(hashText(input, algo));
      setError("");
    } catch (err) {
      setOutput("");
      setError(err instanceof Error ? err.message : "Could not hash text");
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Hash & checksum</h1>
        <p className="lede">Hash text in this browser. The string never leaves the tab.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <div className="stack">
            <label className="field">
              <span>Message</span>
              <textarea value={input} onChange={(event) => setInput(event.target.value)} />
            </label>
            <label className="field">
              <span>Algorithm</span>
              <select value={algo} onChange={(event) => setAlgo(event.target.value)}>
                <option>SHA-256</option>
                <option>SHA-1</option>
                <option>SHA-512</option>
              </select>
            </label>
            <button className="btn" onClick={() => void run()}>
              Hash
            </button>
          </div>
        </section>
        <section className="panel">
          <label className="field">
            <span>Digest</span>
            <textarea readOnly value={output} />
          </label>
          {error && <p role="alert" className="lede">{error}</p>}
          <CopyButton text={output} />
        </section>
      </div>
    </>
  );
}

export function Base64Tool() {
  const [input, setInput] = useState("hello, toolbox");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  function encode() {
    try {
      const bytes = new TextEncoder().encode(input);
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      setOutput(btoa(binary));
      setError("");
    } catch {
      setOutput("");
      setError("Could not encode that text");
    }
  }

  function decode() {
    try {
      const binary = atob(input);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      setOutput(new TextDecoder().decode(bytes));
      setError("");
    } catch {
      setOutput("");
      setError("That is not valid Base64");
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Base64</h1>
        <p className="lede">Encode or decode UTF-8 text with the browser’s built-in codec.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Input</span>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={encode}>
              Encode
            </button>
            <button className="btn ghost" onClick={decode}>
              Decode
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

export function PasswordTool() {
  const [length, setLength] = useState(20);
  const [symbols, setSymbols] = useState(true);
  const [password, setPassword] = useState("");

  function generate() {
    const alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const extra = "!@#$%^&*_-+=?";
    const alphabet = symbols ? alpha + extra : alpha;
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
    setPassword(Array.from(bytes, (n) => alphabet[n % alphabet.length]).join(""));
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Password generator</h1>
        <p className="lede">Cryptographically random, drawn with Web Crypto.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <div className="stack">
            <label className="field">
              <span>Length · {length}</span>
              <input className="range" type="range" min={8} max={64} value={length} onChange={(event) => setLength(Number(event.target.value))} />
            </label>
            <label className="row">
              <input type="checkbox" checked={symbols} onChange={(event) => setSymbols(event.target.checked)} />
              Include symbols
            </label>
            <button className="btn" onClick={generate}>
              Generate
            </button>
            {password && <CopyButton text={password} />}
          </div>
        </section>
        <section className="panel paper">
          <h3>Result</h3>
          <p className="lede">Copy it now. Nothing is stored.</p>
          <p style={{ fontFamily: "var(--mono)", fontSize: "1.15rem", wordBreak: "break-all" }}>{password || "—"}</p>
        </section>
      </div>
    </>
  );
}
