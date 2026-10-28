import test from "node:test";
import assert from "node:assert/strict";
import { applyCropDrag, editCrop, fullCrop, type CropBox } from "../src/lib/cropGeometry.ts";

function assertAspect(box: CropBox, aspect: number) {
  assert.ok(Math.abs(box.w - box.h * aspect) <= 1.5, `${box.w}x${box.h} should stay near ${aspect}:1`);
}

test("full crop covers the image", () => {
  assert.deepEqual(fullCrop(640, 420), { x: 0, y: 0, w: 640, h: 420 });
});

test("moving a crop stops at the image edge", () => {
  const start = { x: 10, y: 10, w: 100, h: 50 };
  assert.deepEqual(applyCropDrag(start, "move", -50, 0, 400, 300, null), { x: 0, y: 10, w: 100, h: 50 });
  assert.deepEqual(applyCropDrag(start, "move", 20, 30, 400, 300, null), { x: 30, y: 40, w: 100, h: 50 });
  assert.deepEqual(applyCropDrag(start, "move", 500, 500, 400, 300, null), { x: 300, y: 250, w: 100, h: 50 });
});

test("free resize changes one edge and stays inside the image", () => {
  const start = { x: 900, y: 10, w: 50, h: 40 };
  assert.deepEqual(applyCropDrag(start, "e", 200, 0, 1000, 800, null), { x: 900, y: 10, w: 100, h: 40 });
  assert.deepEqual(applyCropDrag({ x: 100, y: 10, w: 50, h: 40 }, "w", 80, 0, 1000, 800, null), { x: 149, y: 10, w: 1, h: 40 });
  const corner = applyCropDrag({ x: 40, y: 30, w: 80, h: 60 }, "se", 20, 50, 400, 300, null);
  assert.deepEqual(corner, { x: 40, y: 30, w: 100, h: 110 });
});

test("locked corner resize keeps the captured ratio", () => {
  const start = { x: 100, y: 100, w: 200, h: 100 };
  const wider = applyCropDrag(start, "se", 100, 10, 1000, 800, 2);
  assert.deepEqual(wider, { x: 100, y: 100, w: 220, h: 110 });
  assertAspect(wider, 2);

  const taller = applyCropDrag(start, "se", 10, 100, 1000, 800, 2);
  assert.deepEqual(taller, { x: 100, y: 100, w: 210, h: 105 });
  assertAspect(taller, 2);

  const grown = applyCropDrag({ x: 100, y: 80, w: 200, h: 100 }, "nw", -40, -10, 1000, 800, 2);
  assert.deepEqual(grown, { x: 80, y: 70, w: 220, h: 110 });
  assertAspect(grown, 2);
});

test("locked resize cannot leave the image", () => {
  const stuck = applyCropDrag({ x: 0, y: 0, w: 200, h: 100 }, "se", 50, 50, 200, 100, 2);
  assert.deepEqual(stuck, { x: 0, y: 0, w: 200, h: 100 });

  const east = applyCropDrag({ x: 0, y: 20, w: 100, h: 50 }, "e", 40, 0, 400, 200, 2);
  assert.deepEqual(east, { x: 0, y: 10, w: 140, h: 70 });
  assertAspect(east, 2);

  const capped = applyCropDrag({ x: 0, y: 0, w: 100, h: 50 }, "e", 80, 0, 200, 100, 2);
  assert.deepEqual(capped, { x: 0, y: 0, w: 180, h: 90 });
  assert.ok(capped.x + capped.w <= 200);
  assert.ok(capped.y + capped.h <= 100);
});

test("a locked corner drag stops when it crosses the anchor", () => {
  assert.deepEqual(
    applyCropDrag({ x: 100, y: 100, w: 40, h: 20 }, "se", -100, -50, 500, 500, 2),
    { x: 100, y: 100, w: 2, h: 1 },
  );
  const shrunk = applyCropDrag({ x: 0, y: 0, w: 8, h: 2 }, "se", -100, -100, 200, 200, 4);
  assert.deepEqual(shrunk, { x: 0, y: 0, w: 4, h: 1 });
  assertAspect(shrunk, 4);
});

test("a locked edge shrink keeps the ratio after rounding", () => {
  const shrunk = applyCropDrag({ x: 0, y: 0, w: 40, h: 10 }, "e", -30, 0, 100, 100, 4);
  assert.deepEqual(shrunk, { x: 0, y: 4, w: 9, h: 2 });
  assertAspect(shrunk, 4);
});

test("typed crop values follow the lock and stay in bounds", () => {
  assert.deepEqual(
    editCrop({ x: 10, y: 10, w: 200, h: 100 }, { w: 300 }, 1000, 800, 2),
    { x: 10, y: 10, w: 300, h: 150 },
  );
  assert.deepEqual(
    editCrop({ x: 10, y: 10, w: 100, h: 50 }, { x: 9999 }, 400, 300, null),
    { x: 300, y: 10, w: 100, h: 50 },
  );
  assert.deepEqual(
    editCrop({ x: 10, y: 10, w: 100, h: 50 }, { w: Number.NaN }, 400, 300, null),
    { x: 10, y: 10, w: 100, h: 50 },
  );
  assert.deepEqual(
    editCrop({ x: 0, y: 0, w: 20, h: 10 }, { w: 100 }, 30, 100, 2),
    { x: 0, y: 0, w: 30, h: 15 },
  );
  assert.deepEqual(
    editCrop({ x: 0, y: 0, w: 40, h: 20 }, { h: 80 }, 100, 30, 2),
    { x: 0, y: 0, w: 60, h: 30 },
  );
});
