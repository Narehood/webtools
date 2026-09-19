import { useEffect, useMemo, useRef, useState } from "react";
import { hashFile } from "../../lib/hash";
import { DropZone } from "../../components/DropZone";
import { CopyButton } from "../../components/CopyButton";
import { formatBytes } from "../../lib/image";
import { peekJwt } from "../../lib/jwt";

export function ChecksumTool() {
  const [file, setFile] = useState<File | null>(null);
  const [algo, setAlgo] = useState("SHA-256");
  const [digest, setDigest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => current.current?.abort(), []);

  async function run(nextFile = file, nextAlgo = algo) {
    current.current?.abort();
    if (!nextFile) return;
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setDigest("");
    setError("");
    try {
      const hash = await hashFile(nextFile, nextAlgo, controller.signal);
      if (!controller.signal.aborted) setDigest(hash);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not hash file");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>File checksum</h1>
        <p className="lede">Hash a file in this browser. The bytes never leave this device.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <DropZone
            accept="*/*"
            label="Drop any file"
            hint="ISO, installer, photo, whatever. Hashed locally."
            onFile={(next) => {
              setFile(next);
              setDigest("");
              void run(next, algo);
            }}
          />
          <label className="field" style={{ marginTop: 16 }}>
            <span>Algorithm</span>
            <select
              value={algo}
              onChange={(event) => {
                setAlgo(event.target.value);
                void run(file, event.target.value);
              }}
            >
              <option>SHA-256</option>
              <option>SHA-1</option>
              <option>SHA-512</option>
            </select>
          </label>
        </section>
        <section className="panel">
          <p className="lede">{file ? `${file.name} · ${formatBytes(file.size)}` : "Waiting for a file."}</p>
          {error && <p role="alert" className="lede">{error}</p>}
          <label className="field">
            <span>{busy ? "Hashing…" : "Digest"}</span>
            <textarea readOnly value={digest} />
          </label>
          <div className="row" style={{ marginTop: 12 }}>
            <CopyButton text={digest} />
          </div>
        </section>
      </div>
    </>
  );
}

const SAMPLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJiZW5jaCIsIm5hbWUiOiJXZWJUb29scyIsImlhdCI6MTcxMDAwMDAwMCwiZXhwIjoxODAwMDAwMDAwfQ.signature-not-verified";

export function JwtTool() {
  const [token, setToken] = useState(SAMPLE_JWT);
  const decoded = useMemo(() => {
    try {
      return { ok: true as const, ...peekJwt(token) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Could not decode" };
    }
  }, [token]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>JWT peek</h1>
        <p className="lede">
          Header and payload only. Signatures are not checked and the token is not sent anywhere.
        </p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Token</span>
            <textarea value={token} onChange={(event) => setToken(event.target.value)} />
          </label>
        </section>
        <section className="panel">
          {decoded.ok ? (
            <div className="stack">
              <label className="field">
                <span>Header</span>
                <textarea readOnly value={JSON.stringify(decoded.header, null, 2)} />
              </label>
              <label className="field">
                <span>Payload</span>
                <textarea readOnly value={JSON.stringify(decoded.payload, null, 2)} />
              </label>
              <p className="lede" style={{ marginBottom: 0 }}>
                {decoded.signature ? "Signature present, not verified." : "No signature part."}
              </p>
            </div>
          ) : (
            <p className="lede">{decoded.message}</p>
          )}
        </section>
      </div>
    </>
  );
}
