import { useState } from "react";
import { ToolFrame, saveFile } from "../../../components/Utility";
import { CopyButton } from "../../../components/CopyButton";
import { svgPlaceholder } from "../../../lib/developerUtilities";

export default function ImageWorkbench({ slug }: { slug: string }) {
  const [width, setWidth] = useState("640"),
    [height, setHeight] = useState("360"),
    [label, setLabel] = useState("");
  const [background, setBackground] = useState("#e8e0d4"),
    [foreground, setForeground] = useState("#39342f");
  let svg = "",
    error = "";
  try {
    svg = svgPlaceholder(width, height, label, background, foreground);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not build placeholder.";
  }
  return (
    <ToolFrame slug={slug}>
      <div className="workspace">
        <section className="panel stack">
          <div className="row">
            <label className="field">
              <span>Width</span>
              <input
                type="number"
                min="1"
                max="10000"
                value={width}
                onChange={(event) => setWidth(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Height</span>
              <input
                type="number"
                min="1"
                max="10000"
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span>Label (blank for dimensions)</span>
            <input
              value={label}
              maxLength={200}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <div className="row">
            <label className="field">
              <span>Background</span>
              <input
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Text color</span>
              <input
                type="color"
                value={foreground}
                onChange={(event) => setForeground(event.target.value)}
              />
            </label>
          </div>
          <div className="row">
            <button
              className="btn"
              disabled={!svg}
              onClick={() => saveFile(svg, "placeholder.svg", "image/svg+xml")}
            >
              Download SVG
            </button>
            <CopyButton text={svg} />
          </div>
          {error && <p role="alert">{error}</p>}
        </section>
        <section className="panel stack">
          {svg && (
            <img
              className="placeholder-preview"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
              alt={label || `${width} by ${height} placeholder`}
            />
          )}
          <label className="field">
            <span>SVG source</span>
            <textarea readOnly value={svg} />
          </label>
        </section>
      </div>
    </ToolFrame>
  );
}
