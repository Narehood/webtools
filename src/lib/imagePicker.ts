import { assertImageDimensions, fitImageDimensions } from "./fileImageTools.ts";

/** Keep the displayed raster and palette readback small, even for 40 MP originals. */
export function drawPickerPreview(image: HTMLImageElement, canvas: HTMLCanvasElement) {
  try {
    assertImageDimensions(image.naturalWidth, image.naturalHeight);
    const { scale } = fitImageDimensions(image.naturalWidth, image.naturalHeight, 1_000_000, 1400);
    canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is not available");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } catch (error) {
    canvas.width = 1;
    canvas.height = 1;
    throw error;
  }
}

/** Sample the original raster through a one-pixel canvas, never the scaled preview. */
export function readOriginalImagePixel(image: HTMLImageElement, x: number, y: number) {
  assertImageDimensions(image.naturalWidth, image.naturalHeight);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Enter valid pixel coordinates");
  const point = {
    x: Math.min(image.naturalWidth - 1, Math.max(0, Math.round(x))),
    y: Math.min(image.naturalHeight - 1, Math.max(0, Math.round(y))),
  };
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is not available");
    context.imageSmoothingEnabled = false;
    context.drawImage(image, point.x, point.y, 1, 1, 0, 0, 1, 1);
    return { ...point, data: context.getImageData(0, 0, 1, 1).data };
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
