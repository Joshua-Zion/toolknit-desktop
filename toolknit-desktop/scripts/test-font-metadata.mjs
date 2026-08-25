import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFontMetadata } from '../src/font-metadata.js';

const fontBytes = await readFile(new URL('../public/assets/fonts/Fonarto-Regular.otf', import.meta.url));

const parsed = await parseFontMetadata(fontBytes);
assert.equal(parsed.familyName, 'Fonarto');
assert.equal(parsed.fullName, 'Fonarto-Regular');
assert.equal(parsed.displayName, 'Fonarto-Regular');

const woff2Bytes = await readFile(new URL('../public/assets/fonts/inter-variable.woff2', import.meta.url));
const parsedWoff2 = await parseFontMetadata(woff2Bytes);
assert.equal(parsedWoff2.familyName, 'Inter Variable');
assert.equal(parsedWoff2.fullName, 'Inter Variable');
assert.equal(parsedWoff2.displayName, 'Inter Variable');

// A view with a non-zero offset must only expose the font bytes, not its
// surrounding sentinel bytes.
const padded = new Uint8Array(fontBytes.length + 10);
padded.fill(0xa5, 0, 5);
padded.set(fontBytes, 5);
padded.fill(0x5a, fontBytes.length + 5);
const offsetParsed = await parseFontMetadata(padded.subarray(5, fontBytes.length + 5));
assert.deepEqual(offsetParsed, parsed);

for (const invalid of [null, undefined, new Uint8Array(), new Uint8Array([0, 1, 2, 3]), 'font']) {
  const fallback = await parseFontMetadata(invalid);
  assert.deepEqual(fallback, { familyName: '', fullName: '', displayName: '' });
}

console.log('Font metadata parsing checks passed');
