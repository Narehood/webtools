export type CropBox = { x: number; y: number; w: number; h: number };

export type CropHandle =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

const MIN = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | undefined, fallback: number) {
  return value == null || !Number.isFinite(value) ? fallback : value;
}

function lockedAspect(aspect: number | null): aspect is number {
  return aspect != null && Number.isFinite(aspect) && aspect > 0;
}

export function fullCrop(imageW: number, imageH: number): CropBox {
  return { x: 0, y: 0, w: Math.max(MIN, Math.round(imageW)), h: Math.max(MIN, Math.round(imageH)) };
}

function finalize(x: number, y: number, w: number, h: number, imageW: number, imageH: number): CropBox {
  let width = Math.max(MIN, Math.round(w));
  let height = Math.max(MIN, Math.round(h));
  if (width > imageW) width = Math.max(MIN, imageW);
  if (height > imageH) height = Math.max(MIN, imageH);
  let left = Math.round(x);
  let top = Math.round(y);
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  if (left + width > imageW) left = Math.max(0, imageW - width);
  if (top + height > imageH) top = Math.max(0, imageH - height);
  return { x: left, y: top, w: width, h: height };
}

export function applyCropDrag(
  start: CropBox,
  handle: CropHandle,
  dx: number,
  dy: number,
  imageW: number,
  imageH: number,
  aspect: number | null,
): CropBox {
  if (imageW < 1 || imageH < 1) return { x: 0, y: 0, w: MIN, h: MIN };
  if (handle === "move") {
    return finalize(
      clamp(start.x + dx, 0, Math.max(0, imageW - start.w)),
      clamp(start.y + dy, 0, Math.max(0, imageH - start.h)),
      start.w,
      start.h,
      imageW,
      imageH,
    );
  }
  if (lockedAspect(aspect) && handle.length === 2) {
    return resizeLockedCorner(start, handle, dx, dy, imageW, imageH, aspect);
  }
  if (lockedAspect(aspect)) {
    return resizeLockedEdge(start, handle, dx, dy, imageW, imageH, aspect);
  }
  return resizeFree(start, handle, dx, dy, imageW, imageH);
}

function resizeFree(
  start: CropBox,
  handle: string,
  dx: number,
  dy: number,
  imageW: number,
  imageH: number,
): CropBox {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;

  if (handle.includes("w")) left = clamp(start.x + dx, 0, right - MIN);
  if (handle.includes("e")) right = clamp(start.x + start.w + dx, left + MIN, imageW);
  if (handle.includes("n")) top = clamp(start.y + dy, 0, bottom - MIN);
  if (handle.includes("s")) bottom = clamp(start.y + start.h + dy, top + MIN, imageH);

  return finalize(left, top, right - left, bottom - top, imageW, imageH);
}

function resizeLockedCorner(
  start: CropBox,
  handle: string,
  dx: number,
  dy: number,
  imageW: number,
  imageH: number,
  aspect: number,
): CropBox {
  const right0 = start.x + start.w;
  const bottom0 = start.y + start.h;
  const west = handle.includes("w");
  const north = handle.includes("n");
  const anchorX = west ? right0 : start.x;
  const anchorY = north ? bottom0 : start.y;
  const pointerX = (west ? start.x : right0) + dx;
  const pointerY = (north ? start.y : bottom0) + dy;

  let w = Math.abs(pointerX - anchorX);
  let h = Math.abs(pointerY - anchorY);
  if (h < 1e-6) h = w / aspect;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;

  const maxW = Math.max(MIN, west ? anchorX : imageW - anchorX);
  const maxH = Math.max(MIN, north ? anchorY : imageH - anchorY);
  if (w > maxW) {
    w = maxW;
    h = w / aspect;
  }
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  w = Math.max(MIN, Math.min(w, maxW));
  h = Math.max(MIN, Math.min(h, maxH));

  const x = west ? anchorX - w : anchorX;
  const y = north ? anchorY - h : anchorY;
  return finalize(x, y, w, h, imageW, imageH);
}

function resizeLockedEdge(
  start: CropBox,
  handle: string,
  dx: number,
  dy: number,
  imageW: number,
  imageH: number,
  aspect: number,
): CropBox {
  const left0 = start.x;
  const top0 = start.y;
  const right0 = start.x + start.w;
  const bottom0 = start.y + start.h;
  const cx = (left0 + right0) / 2;
  const cy = (top0 + bottom0) / 2;

  if (handle === "e" || handle === "w") {
    const maxW = Math.max(MIN, handle === "e" ? imageW - left0 : right0);
    let w = clamp(handle === "e" ? start.w + dx : start.w - dx, MIN, maxW);
    let h = w / aspect;
    if (h > imageH) {
      h = imageH;
      w = Math.min(maxW, h * aspect);
      h = w / aspect;
    }
    const x = handle === "e" ? left0 : right0 - w;
    let y = cy - h / 2;
    if (y < 0) y = 0;
    if (y + h > imageH) y = Math.max(0, imageH - h);
    return finalize(x, y, w, h, imageW, imageH);
  }

  const maxH = Math.max(MIN, handle === "s" ? imageH - top0 : bottom0);
  let h = clamp(handle === "s" ? start.h + dy : start.h - dy, MIN, maxH);
  let w = h * aspect;
  if (w > imageW) {
    w = imageW;
    h = Math.min(maxH, w / aspect);
    w = h * aspect;
  }
  const y = handle === "s" ? top0 : bottom0 - h;
  let x = cx - w / 2;
  if (x < 0) x = 0;
  if (x + w > imageW) x = Math.max(0, imageW - w);
  return finalize(x, y, w, h, imageW, imageH);
}

export function editCrop(
  current: CropBox,
  patch: Partial<CropBox>,
  imageW: number,
  imageH: number,
  aspect: number | null,
): CropBox {
  const widthChanged = patch.w != null && Number.isFinite(patch.w);
  const heightChanged = patch.h != null && Number.isFinite(patch.h);
  let w = finite(patch.w, current.w);
  let h = finite(patch.h, current.h);
  if (lockedAspect(aspect) && widthChanged && !heightChanged) h = Math.round(w / aspect);
  if (lockedAspect(aspect) && heightChanged && !widthChanged) w = Math.round(h * aspect);
  w = clamp(Math.round(w), MIN, Math.max(MIN, imageW));
  h = clamp(Math.round(h), MIN, Math.max(MIN, imageH));
  if (lockedAspect(aspect) && widthChanged && !heightChanged && Math.round(w / aspect) !== h) {
    w = clamp(Math.round(h * aspect), MIN, Math.max(MIN, imageW));
  }
  if (lockedAspect(aspect) && heightChanged && !widthChanged && Math.round(h * aspect) !== w) {
    h = clamp(Math.round(w / aspect), MIN, Math.max(MIN, imageH));
  }
  const x = clamp(Math.round(finite(patch.x, current.x)), 0, Math.max(0, imageW - w));
  const y = clamp(Math.round(finite(patch.y, current.y)), 0, Math.max(0, imageH - h));
  return { x, y, w, h };
}
