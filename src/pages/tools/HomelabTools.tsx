import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { CopyButton } from "../../components/CopyButton";
import { chmodFromOctal, chmodToOctal, chmodToSymbolic, emptyChmod, type ChmodBits } from "../../lib/chmod";
import { parseCidr } from "../../lib/cidr";
import { htpasswdLine } from "../../lib/htpasswd";
import { inspectKeyMaterial } from "../../lib/pem";
import { totpCode } from "../../lib/totp";
import { wifiPayload } from "../../lib/wifi";

export function CidrTool() {
  const [input, setInput] = useState("192.168.1.10/24");
  const [query, setQuery] = useState("192.168.1.50");
  const result = useMemo(() => {
    try {
      return { ok: true as const, value: parseCidr(input, query) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Could not parse" };
    }
  }, [input, query]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>CIDR calculator</h1>
        <p className="lede">Network, range, and “is this IP in the prefix?” — all in this tab.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>CIDR</span>
            <input value={input} onChange={(event) => setInput(event.target.value)} />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Contains IP? (optional)</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </section>
        <section className="panel">
          {result.ok ? (
            <div className="stat-grid">
              <div className="stat">
                <span>Network</span>
                <b className="wrap">{result.value.network}/{result.value.prefix}</b>
              </div>
              <div className="stat">
                <span>Range</span>
                <b className="wrap">{result.value.first} – {result.value.last}</b>
              </div>
              {result.value.mask && (
                <div className="stat">
                  <span>Mask</span>
                  <b>{result.value.mask}</b>
                </div>
              )}
              {result.value.broadcast && (
                <div className="stat">
                  <span>Broadcast</span>
                  <b>{result.value.broadcast}</b>
                </div>
              )}
              <div className="stat">
                <span>Addresses</span>
                <b>{result.value.total}</b>
              </div>
              <div className="stat">
                <span>In prefix?</span>
                <b>{result.value.contains === undefined ? "—" : result.value.contains ? "Yes" : "No"}</b>
              </div>
            </div>
          ) : (
            <p className="lede">{result.message}</p>
          )}
        </section>
      </div>
    </>
  );
}

export function ChmodTool() {
  const [bits, setBits] = useState(emptyChmod);
  const [octalInput, setOctalInput] = useState("755");
  const octal = chmodToOctal(bits);
  const symbolic = chmodToSymbolic(bits);

  function toggle(path: (bits: ChmodBits) => void) {
    setBits((current) => {
      const next = structuredClone(current);
      path(next);
      setOctalInput(chmodToOctal(next));
      return next;
    });
  }

  function applyOctal() {
    try {
      const next = chmodFromOctal(octalInput);
      setBits(next);
      setOctalInput(chmodToOctal(next));
    } catch {
      /* keep typing */
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>chmod calculator</h1>
        <p className="lede">Checkboxes to octal and symbolic, or paste 755 the other way.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <div className="chmod-grid">
            {(["owner", "group", "other"] as const).map((who) => (
              <div key={who} className="chmod-col">
                <strong>{who}</strong>
                {(["r", "w", "x"] as const).map((flag) => (
                  <label key={flag}>
                    <input
                      type="checkbox"
                      checked={bits[who][flag]}
                      onChange={() =>
                        toggle((next) => {
                          next[who][flag] = !next[who][flag];
                        })
                      }
                    />
                    {flag === "r" ? "read" : flag === "w" ? "write" : "execute"}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="stack" style={{ marginTop: 16 }}>
            <label className="row">
              <input type="checkbox" checked={bits.setuid} onChange={() => toggle((next) => { next.setuid = !next.setuid; })} />
              setuid
            </label>
            <label className="row">
              <input type="checkbox" checked={bits.setgid} onChange={() => toggle((next) => { next.setgid = !next.setgid; })} />
              setgid
            </label>
            <label className="row">
              <input type="checkbox" checked={bits.sticky} onChange={() => toggle((next) => { next.sticky = !next.sticky; })} />
              sticky
            </label>
          </div>
        </section>
        <section className="panel">
          <div className="stat-grid">
            <div className="stat">
              <span>Octal</span>
              <b>{octal}</b>
            </div>
            <div className="stat">
              <span>Symbolic</span>
              <b>{symbolic}</b>
            </div>
          </div>
          <label className="field" style={{ marginTop: 16 }}>
            <span>Parse octal</span>
            <input
              value={octalInput}
              onChange={(event) => {
                setOctalInput(event.target.value);
              }}
              onBlur={applyOctal}
            />
          </label>
        </section>
      </div>
    </>
  );
}

export function WifiQrTool() {
  const [ssid, setSsid] = useState("Homelab");
  const [password, setPassword] = useState("");
  const [security, setSecurity] = useState<"WPA" | "WEP" | "nopass">("WPA");
  const [hidden, setHidden] = useState(false);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const payload = useMemo(() => {
    try {
      return { ok: true as const, value: wifiPayload(ssid, password, security, hidden) };
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : "Could not build payload" };
    }
  }, [ssid, password, security, hidden]);

  useEffect(() => {
    if (!payload.ok) {
      setSvg("");
      setError(payload.message);
      return;
    }
    let cancelled = false;
    QRCode.toString(payload.value, { type: "svg", margin: 1, width: 220, color: { dark: "#1a1612", light: "#ffffff" } })
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
  }, [payload]);

  const isSvg = svg.startsWith("<svg");

  function download() {
    if (!isSvg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wifi.svg";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Wi-Fi QR</h1>
        <p className="lede">WIFI: payload drawn here. The password never leaves this tab.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>SSID</span>
            <input value={ssid} onChange={(event) => setSsid(event.target.value)} />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Security</span>
            <select value={security} onChange={(event) => setSecurity(event.target.value as typeof security)}>
              <option value="WPA">WPA / WPA2 / WPA3</option>
              <option value="WEP">WEP</option>
              <option value="nopass">Open</option>
            </select>
          </label>
          {security !== "nopass" && (
            <label className="field" style={{ marginTop: 12 }}>
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          )}
          <label className="row" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
            Hidden network
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={download} disabled={!isSvg}>
              Download SVG
            </button>
            {payload.ok && <CopyButton text={payload.value} />}
          </div>
        </section>
        <section className="panel paper">
          <h3>Preview</h3>
          {isSvg ? <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="lede">{error}</p>}
        </section>
      </div>
    </>
  );
}

export function TotpTool() {
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("------");
  const [remaining, setRemaining] = useState(30);
  const [user, setUser] = useState("admin");
  const [password, setPassword] = useState("");
  const [htpasswd, setHtpasswd] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (!secret.trim()) {
        setCode("------");
        return;
      }
      try {
        const next = totpCode(secret);
        if (!cancelled) {
          setCode(next.code);
          setRemaining(next.remaining);
        }
      } catch {
        if (!cancelled) setCode("------");
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [secret]);

  async function makeHtpasswd() {
    setBusy(true);
    try {
      setHtpasswd(await htpasswdLine(user, password));
      setError("");
    } catch (err) {
      setHtpasswd("");
      setError(err instanceof Error ? err.message : "Could not hash");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>TOTP & htpasswd</h1>
        <p className="lede">Authenticator codes and a bcrypt basic-auth line. Secrets stay in this tab.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>TOTP secret (Base32)</span>
            <input value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="off" />
          </label>
          <div className="stat-grid" style={{ marginTop: 16 }}>
            <div className="stat">
              <span>Code</span>
              <b style={{ fontFamily: "var(--mono)", letterSpacing: "0.12em" }}>{code}</b>
            </div>
            <div className="stat">
              <span>Seconds left</span>
              <b>{secret.trim() ? remaining : "—"}</b>
            </div>
          </div>
        </section>
        <section className="panel">
          <label className="field">
            <span>Username</span>
            <input value={user} onChange={(event) => setUser(event.target.value)} />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => void makeHtpasswd()} disabled={busy}>
              {busy ? "Hashing…" : "Make htpasswd"}
            </button>
            <CopyButton text={htpasswd} />
          </div>
          {error && <p className="lede">{error}</p>}
          {htpasswd && (
            <p className="lede" style={{ marginTop: 12, fontFamily: "var(--mono)", wordBreak: "break-all" }}>
              {htpasswd}
            </p>
          )}
        </section>
      </div>
    </>
  );
}

export function PemTool() {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<{ label: string; value: string }[]>([]);
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);

  async function inspect() {
    setBusy(true);
    setError("");
    setWarning("");
    try {
      const view = await inspectKeyMaterial(input);
      setFields(view.fields);
      setWarning(view.warning ?? "");
    } catch (err) {
      setFields([]);
      setError(err instanceof Error ? err.message : "Could not parse");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Cert & key peek</h1>
        <p className="lede">
          PEM certificates, CSRs, and SSH public keys. Private keys are spotted and left alone — nothing is uploaded.
        </p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Paste</span>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="-----BEGIN CERTIFICATE-----" />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => void inspect()} disabled={busy}>
              {busy ? "Reading…" : "Inspect"}
            </button>
          </div>
        </section>
        <section className="panel">
          {error && <p className="lede">{error}</p>}
          {warning && <p className="lede">{warning}</p>}
          {fields.length ? (
            <div className="stack">
              {fields.map((field) => (
                <div className="stat" key={field.label}>
                  <span>{field.label}</span>
                  <b className="wrap">{field.value}</b>
                </div>
              ))}
            </div>
          ) : (
            !error && !warning && <p className="lede">Subject, SAN, expiry, and fingerprints land here.</p>
          )}
        </section>
      </div>
    </>
  );
}
