import test from "node:test";
import assert from "node:assert/strict";
import { drawPickerPreview, readOriginalImagePixel } from "../src/lib/imagePicker.ts";

test("image picker bounds its preview and palette buffer for large and narrow originals", () => {
  for (const [width, height] of [[8000, 5000], [5000, 8000], [40000, 1], [1, 40000], [999, 999], [3, 2]]) {
    const image = { naturalWidth: width, naturalHeight: height } as HTMLImageElement;
    let drawn: unknown[] = [];
    let read: number[] = [];
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({
        clearRect() {},
        drawImage(...args: unknown[]) { drawn = args; },
        getImageData(...args: number[]) { read = args; return { width: args[2], height: args[3] }; },
      }),
    } as unknown as HTMLCanvasElement;
    const frame = drawPickerPreview(image, canvas);
    assert.ok(canvas.width * canvas.height <= 1_000_000);
    assert.ok(Math.max(canvas.width, canvas.height) <= 1400);
    assert.deepEqual(drawn, [image, 0, 0, canvas.width, canvas.height]);
    assert.deepEqual(read, [0, 0, canvas.width, canvas.height]);
    assert.equal(frame.width * frame.height, canvas.width * canvas.height);
  }
});

test("image picker releases a failed preview allocation", () => {
  const image = { naturalWidth: 8000, naturalHeight: 5000 } as HTMLImageElement;
  for (const failure of ["context", "draw", "read"]) {
    const canvas = {
      width: 8000, height: 5000,
      getContext: () => failure === "context" ? null : {
        clearRect() {},
        drawImage() { if (failure === "draw") throw new Error("draw failed"); },
        getImageData() { throw new Error("read failed"); },
      },
    } as unknown as HTMLCanvasElement;
    assert.throws(() => drawPickerPreview(image, canvas));
    assert.equal(canvas.width, 1);
    assert.equal(canvas.height, 1);
  }
});

test("exact pixel sampling crops the original coordinates into one pixel and retains alpha", (t) => {
  const image = { naturalWidth: 8000, naturalHeight: 5000 } as HTMLImageElement;
  let drawn: unknown[] = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({
      drawImage(...args: unknown[]) { drawn = args; },
      getImageData() { return { data: new Uint8ClampedArray([255, 1, 7, 128]) }; },
    }),
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
  t.after(() => { Reflect.deleteProperty(globalThis, "document"); });
  const pixel = readOriginalImagePixel(image, 3001, 2001);
  assert.deepEqual(drawn, [image, 3001, 2001, 1, 1, 0, 0, 1, 1]);
  assert.deepEqual([...pixel.data], [255, 1, 7, 128]);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
  assert.equal(readOriginalImagePixel(image, -10, 9000).x, 0);
  assert.equal(readOriginalImagePixel(image, -10, 9000).y, 4999);
  assert.throws(() => readOriginalImagePixel(image, NaN, 0), /valid pixel/);
});
