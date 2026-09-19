import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashText, hashFile } from "../src/lib/hash.ts";
import { encodeCanvas } from "../src/lib/image.ts";

for (const algorithm of ['SHA-1', 'SHA-256', 'SHA-512']) {
  test(`${algorithm} hashes text and streamed files using standard digests`, async () => {
    const text = 'Hello, 世界!\n'.repeat(10000);
    const expected = createHash(algorithm.replace('-', '').toLowerCase()).update(text).digest('hex');
    assert.equal(hashText(text, algorithm), expected);
    assert.equal(await hashFile(new Blob([text]), algorithm), expected);
    assert.equal(await hashFile(new Blob([]), algorithm), createHash(algorithm.replace('-', '').toLowerCase()).digest('hex'));
  });
}

test('hashing can be cancelled and rejects unknown algorithms', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(hashFile(new Blob(['abc']), 'SHA-256', controller.signal), { name: 'AbortError' });
  assert.throws(() => hashText('abc', 'unknown'));
});

test('image encoder rejects a browser silently falling back to PNG', async () => {
  const canvas = { toBlob(callback: (blob: Blob) => void) { callback(new Blob(['PNG'], { type: 'image/png' })); } };
  await assert.rejects(encodeCanvas(canvas as unknown as HTMLCanvasElement, 'image/avif', 0.8), /cannot encode AVIF/);
  assert.equal((await encodeCanvas(canvas as unknown as HTMLCanvasElement, 'image/png', 0.8)).type, 'image/png');
});
