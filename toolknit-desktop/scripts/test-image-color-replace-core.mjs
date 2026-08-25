import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deltaE76, hexToRgb, replaceImageColors, rgbToHex, sampleRgbaPixel } from '../src/image-color-replace-core.js';

assert.deepEqual(hexToRgb('#2D7AD2'), [45, 122, 210]);
assert.equal(rgbToHex([45, 122, 210]), '#2D7AD2');
assert.equal(deltaE76([50, 0, 0], [50, 0, 0]), 0);

const source = new Uint8ClampedArray([
  255,255,255,255, 255,255,255,255, 0,0,0,255, 255,255,255,255,
  255,255,255,255, 255,255,255,255, 0,0,0,255, 255,255,255,255,
  0,0,0,255,       0,0,0,255,       0,0,0,255, 255,255,255,255
]);
const smart = replaceImageColors(source, 4, 3, { source:[255,255,255], target:[0,0,255], threshold:2, softness:0, smart:true, seedX:0, seedY:0, preserveLuminance:false });
assert.equal(smart.changedPixels, 4, 'only the connected white region must change');
assert.deepEqual(sampleRgbaPixel(smart.data, 4, 3, 0, 0), [0,0,255,255]);
assert.deepEqual(sampleRgbaPixel(smart.data, 4, 3, 3, 2), [255,255,255,255]);
const global = replaceImageColors(source, 4, 3, { source:[255,255,255], target:[0,0,255], threshold:2, softness:0, smart:false, preserveLuminance:false });
assert.equal(global.changedPixels, 7, 'global mode must replace disconnected matches');

const featherSource = new Uint8ClampedArray([255,255,255,255, 250,250,250,255]);
const hardEdge = replaceImageColors(featherSource, 2, 1, { source:[255,255,255], target:[0,0,255], threshold:5, softness:0, smart:false, preserveLuminance:false });
assert.deepEqual(sampleRgbaPixel(hardEdge.data, 2, 1, 1, 0), [0,0,255,255], 'softness=0 must produce a hard replacement edge');

const uiSource = await readFile(new URL('../src/image-color-replace-ui.js', import.meta.url), 'utf8');
const uiStyles = await readFile(new URL('../src/tool-page-v2-final.css', import.meta.url), 'utf8');
assert.match(uiSource, /className='color-replace-output-link'/, 'export result must render a dedicated clickable path');
assert.match(uiSource, /invoke\('open_path',\{path\}\)/, 'clicking the exported path must open its containing folder');
assert.match(uiSource, /rawPath\.startsWith\('\\\\\\\\\?\\\\'\)/, 'Windows extended path prefix must be removed for Explorer');
assert.match(uiStyles, /\.color-replace-output-link\s*\{[^}]*color:\s*#0969da/s, 'exported path must use blue link styling');
console.log('image color replacement core tests passed');
