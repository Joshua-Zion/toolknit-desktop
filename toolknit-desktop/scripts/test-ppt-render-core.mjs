import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  PptRenderError,
  createPptToImageManifest,
  createPptToPdfFileName,
  createPptToPdfManifest,
  inspectPptxRenderBytes,
  normalizePptToImageClarity,
  normalizePptToImageFormat,
  normalizePptToImagePages,
  sanitizePptRenderBaseName
} from '../src/ppt-render-core.js';

async function createFixturePptx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256"/><p:sldId id="257"/></p:sldIdLst></p:presentation>`);
  zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
  zip.file('ppt/slides/slide2.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

assert.equal(sanitizePptRenderBaseName('..\\演示:deck.pptx'), '演示_deck');
assert.equal(createPptToPdfFileName('demo.pptx'), 'demo.pdf');
assert.equal(normalizePptToImageFormat('jpeg'), 'jpg');
assert.equal(normalizePptToImageClarity('print'), 'print');
assert.deepEqual(normalizePptToImagePages([2, 1], 2), [1, 2]);
assert.throws(
  () => normalizePptToImagePages([1, 1], 2),
  error => error instanceof PptRenderError && error.code === 'invalid_pages'
);

const bytes = await createFixturePptx();
const manifest = await inspectPptxRenderBytes(bytes, { sourceName: 'demo.pptx' });
assert.equal(manifest.slide_count, 2);
assert.equal(manifest.base_name, 'demo');
assert.equal(manifest.source_name, 'demo.pptx');

const pdfManifest = createPptToPdfManifest({
  source_name: 'demo.pptx',
  input: { path: 'demo.pptx', bytes: bytes.byteLength },
  renderer: { available: true },
  slide_count: 2,
  page_count: 2,
  output_dir: 'out',
  output_path: 'out/demo.pdf',
  output_file: 'demo.pdf',
  output_bytes: 1234
});
assert.equal(pdfManifest.tool, 'ppt.to-pdf');
assert.equal(pdfManifest.page_count_matches_slides, true);

const imageManifest = createPptToImageManifest({
  source_name: 'demo.pptx',
  input: { path: 'demo.pptx', bytes: bytes.byteLength },
  renderer: { available: true },
  slide_count: 2,
  page_count: 2,
  selected_pages: [1, 2],
  format: 'png',
  clarity: 'high',
  output_dir: 'out',
  output_count: 2,
  outputs: [{ path: 'out/page_01.png' }]
});
assert.equal(imageManifest.tool, 'ppt.to-image');
assert.deepEqual(imageManifest.selected_pages, [1, 2]);

await assert.rejects(
  () => inspectPptxRenderBytes(Buffer.from('not-a-pptx'), { sourceName: 'fake.pptx' }),
  error => error instanceof PptRenderError && error.code === 'invalid_pptx'
);
await assert.rejects(
  () => inspectPptxRenderBytes(bytes, { sourceName: 'demo.ppt' }),
  error => error instanceof PptRenderError && error.code === 'invalid_extension'
);

console.log('PPT render core regression checks passed');
