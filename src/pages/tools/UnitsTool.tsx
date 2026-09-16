import { useMemo, useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import { convertAll, convertGroups, formatSource, type ConvertKind } from "../../lib/convert";

export function UnitsTool() {
  const [kind, setKind] = useState<ConvertKind>("data");
  const [fromId, setFromId] = useState("mb");
  const [raw, setRaw] = useState("1");
  const group = convertGroups.find((item) => item.id === kind) ?? convertGroups[0];
  const result = useMemo(() => {
    try {
      return { ok: true as const, rows: convertAll(kind, fromId, raw) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Could not convert" };
    }
  }, [kind, fromId, raw]);

  function changeKind(next: ConvertKind) {
    const nextGroup = convertGroups.find((item) => item.id === next);
    setKind(next);
    setFromId(nextGroup?.units[0]?.id ?? "");
    setRaw("1");
  }

  const copyText = result.ok
    ? result.rows.map((row) => `${row.name}\t${row.value}`).join("\n")
    : "";

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Unit converter</h1>
        <p className="lede">Everyday measures and digital storage, converted in this tab. Pick a category, type a number, read the rest.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Category</span>
            <select value={kind} onChange={(event) => changeKind(event.target.value as ConvertKind)}>
              {convertGroups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Value</span>
            <input value={raw} onChange={(event) => setRaw(event.target.value)} inputMode="decimal" />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>From</span>
            <select value={fromId} onChange={(event) => setFromId(event.target.value)}>
              {group.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
          {group.note && (
            <p className="lede" style={{ marginTop: 16, marginBottom: 0 }}>
              {group.note}
            </p>
          )}
        </section>
        <section className="panel">
          <div className="row" style={{ marginBottom: 12 }}>
            <CopyButton text={copyText} />
          </div>
          {result.ok ? (
            <div className="stack">
              {result.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`convert-row${row.id === fromId ? " current" : ""}`}
                  onClick={() => {
                    if (row.id === fromId || row.amount === null || !Number.isFinite(row.amount)) return;
                    setRaw(formatSource(row.amount));
                    setFromId(row.id);
                  }}
                >
                  <span>{row.name}</span>
                  <b className="wrap">{row.value || "—"}</b>
                </button>
              ))}
            </div>
          ) : (
            <p className="lede">{result.message}</p>
          )}
        </section>
      </div>
    </>
  );
}
