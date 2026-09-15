export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    image.src = url;
  });
}

export function canvasFromImage(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(image, 0, 0);
  return { canvas, ctx };
}

function colorDistance(a: number[], b: Uint8ClampedArray, i: number) {
  const dr = a[0] - b[i];
  const dg = a[1] - b[i + 1];
  const db = a[2] - b[i + 2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function sampleCornerColor(data: Uint8ClampedArray, width: number, height: number) {
  const points = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];
  const avg = [0, 0, 0];
  for (const index of points) {
    avg[0] += data[index];
    avg[1] += data[index + 1];
    avg[2] += data[index + 2];
  }
  return avg.map((value) => value / points.length);
}

export function removeFlatBackground(image: HTMLImageElement, tolerance: number) {
  const { canvas, ctx } = canvasFromImage(image);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = frame;
  const key = sampleCornerColor(data, width, height);
  const threshold = tolerance * 2.2;

  for (let i = 0; i < data.length; i += 4) {
    if (colorDistance(key, data, i) <= threshold) {
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(frame, 0, 0);
  return canvas;
}

export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((value) => resolve(value), mime, quality),
  );
  if (!blob) throw new Error("This browser could not encode that format");
  return blob;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function sampleProductPng(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.fillStyle = "#e8f0ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#c9783a";
  ctx.beginPath();
  ctx.roundRect(170, 90, 300, 240, 28);
  ctx.fill();
  ctx.fillStyle = "#f3eee4";
  ctx.font = "700 42px Georgia";
  ctx.textAlign = "center";
  ctx.fillText("BENCH", 320, 230);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Sample failed"))), "image/png"),
  );
  return new File([blob], "sample-product.png", { type: "image/png" });
}
