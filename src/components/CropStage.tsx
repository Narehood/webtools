import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { applyCropDrag, type CropBox, type CropHandle } from "../lib/cropGeometry";

const HANDLES: Exclude<CropHandle, "move">[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const HANDLE_LABEL: Record<Exclude<CropHandle, "move">, string> = {
  n: "top edge",
  s: "bottom edge",
  e: "right edge",
  w: "left edge",
  ne: "top-right corner",
  nw: "top-left corner",
  se: "bottom-right corner",
  sw: "bottom-left corner",
};

type Props = {
  src: string;
  imageWidth: number;
  imageHeight: number;
  crop: CropBox;
  aspect: number | null;
  disabled?: boolean;
  onChange: (crop: CropBox) => void;
};

export function CropStage({ src, imageWidth, imageHeight, crop, aspect, disabled = false, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stopDrag = useRef<(() => void) | null>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || imageWidth < 1 || imageHeight < 1) return;
    const update = () => {
      const avail = wrap.clientWidth;
      if (avail < 1) return;
      const scale = Math.min(avail / imageWidth, 520 / imageHeight);
      setFrame({ width: imageWidth * scale, height: imageHeight * scale });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [imageWidth, imageHeight, src]);

  useEffect(() => () => stopDrag.current?.(), []);

  function onPointerDown(handle: CropHandle, event: ReactPointerEvent) {
    if (disabled || event.button !== 0 || frame.width < 1) return;
    event.preventDefault();
    event.stopPropagation();
    const stage = event.currentTarget.closest(".crop-stage") as HTMLElement | null;
    const rect = stage?.getBoundingClientRect();
    const width = rect?.width || frame.width;
    const height = rect?.height || frame.height;
    boxRef.current?.focus();
    const drag = {
      handle,
      origin: crop,
      clientX: event.clientX,
      clientY: event.clientY,
      scaleX: imageWidth / width,
      scaleY: imageHeight / height,
      imageWidth,
      imageHeight,
      aspect,
    };
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== event.pointerId) return;
      const dx = (pointer.clientX - drag.clientX) * drag.scaleX;
      const dy = (pointer.clientY - drag.clientY) * drag.scaleY;
      onChange(applyCropDrag(drag.origin, drag.handle, dx, dy, drag.imageWidth, drag.imageHeight, drag.aspect));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      stage?.removeEventListener("lostpointercapture", up);
      stopDrag.current = null;
    };
    stopDrag.current?.();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    stage?.addEventListener("lostpointercapture", up);
    if (stage) stage.setPointerCapture(event.pointerId);
    stopDrag.current = up;
  }

  function nudge(handle: CropHandle, event: KeyboardEvent) {
    if (disabled) return;
    const step = event.shiftKey ? 10 : 1;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;
    event.preventDefault();
    event.stopPropagation();
    onChange(applyCropDrag(crop, handle, dx, dy, imageWidth, imageHeight, handle === "move" ? null : aspect));
  }

  const ready = frame.width > 0 && imageWidth > 0 && imageHeight > 0;
  const box = ready
    ? {
        left: (crop.x / imageWidth) * frame.width,
        top: (crop.y / imageHeight) * frame.height,
        width: (crop.w / imageWidth) * frame.width,
        height: (crop.h / imageHeight) * frame.height,
      }
    : null;

  return (
    <div className="crop-wrap" ref={wrapRef}>
      {box && (
        <div className={`crop-stage${box.width < 72 || box.height < 72 ? " tight" : ""}${disabled ? " is-disabled" : ""}`} style={{ width: frame.width, height: frame.height }}>
          <img src={src} alt="" draggable={false} />
          <div className="crop-dim" style={{ left: 0, top: 0, width: frame.width, height: box.top }} />
          <div
            className="crop-dim"
            style={{ left: 0, top: box.top + box.height, width: frame.width, height: Math.max(0, frame.height - box.top - box.height) }}
          />
          <div className="crop-dim" style={{ left: 0, top: box.top, width: box.left, height: box.height }} />
          <div
            className="crop-dim"
            style={{ left: box.left + box.width, top: box.top, width: Math.max(0, frame.width - box.left - box.width), height: box.height }}
          />
          <div
            ref={boxRef}
            className="crop-box"
            style={box}
            role="group"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            aria-label={`Crop selection, ${crop.w} by ${crop.h} pixels at ${crop.x}, ${crop.y}. Drag to move. Arrow keys nudge.`}
            onPointerDown={(event) => onPointerDown("move", event)}
            onKeyDown={(event) => nudge("move", event)}
          >
            <div className="crop-grid" />
            <span className="crop-readout">{crop.w}×{crop.h}</span>
            {HANDLES.map((handle) => (
              <button
                key={handle}
                type="button"
                className={`crop-handle ${handle}`}
                aria-label={`Resize from the ${HANDLE_LABEL[handle]}. Arrow keys resize. Shift moves 10 pixels.`}
                disabled={disabled}
                onPointerDown={(event) => onPointerDown(handle, event)}
                onKeyDown={(event) => nudge(handle, event)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
