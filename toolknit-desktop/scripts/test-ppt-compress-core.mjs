import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  PptCompressError,
  compressPptxBytes,
  createPptCompressManifest,
  sanitizePptCompressBaseName
} from '../src/ppt-compress-core.js';

function pseudoImageBytes(size) {
  const bytes = Buffer.alloc(size);
  for (let index = 0; index < bytes.length; index++) bytes[index] = (index * 73 + 19) & 0xFF;
  return bytes;
}

async function createFixturePptx() {
  const zip = new JSZip();
  const imageBytes = pseudoImageBytes(80 * 1024);
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.presentationml.printerSettings"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/docProps/thumbnail.jpeg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/media/unused.png" ContentType="image/png"/>
</Types>`);
  zip.file('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="docProps/thumbnail.jpeg"/>
</Relationships>`);
  zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
</p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings" Target="printerSettings/printerSettings1.bin"/>
</Relationships>`);
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:pic><a:blip r:embed="rId1"/></p:pic><p:pic><a:blip r:embed="rId2"/></p:pic></p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/_rels/slide1.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>
</Relationships>`);
  zip.file('ppt/media/image1.png', imageBytes);
  zip.file('ppt/media/image2.png', imageBytes);
  zip.file('ppt/media/unused.png', pseudoImageBytes(40 * 1024));
  zip.file('ppt/printerSettings/printerSettings1.bin', pseudoImageBytes(10 * 1024));
  zip.file('docProps/thumbnail.jpeg', pseudoImageBytes(20 * 1024));
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

assert.equal(sanitizePptCompressBaseName('..\\demo:name.pptx'), 'demo_name');

const pptx = await createFixturePptx();
const result = await compressPptxBytes(pptx, { sourceName: 'demo.pptx', level: 'high' });
assert.equal(result.tool, 'ppt.compress');
assert.equal(result.level, 'high');
assert.equal(result.slide_count, 1);
assert.equal(result.media_count, 3);
assert.equal(result.operations.removed_thumbnails, 1);
assert.equal(result.operations.removed_unused_media, 1);
assert.equal(result.operations.deduplicated_media, 1);
assert.equal(result.operations.removed_printer_settings, 1);
assert.ok(result.operations.rewritten_relationships >= 1);
assert.ok(result.saved_bytes > 0);
assert.ok(result.compressed_bytes < result.original_bytes);
assert.equal(result.bytes instanceof Uint8Array, true);

const optimizedZip = await JSZip.loadAsync(result.bytes);
assert.equal(Boolean(optimizedZip.file('docProps/thumbnail.jpeg')), false);
assert.equal(Boolean(optimizedZip.file('ppt/media/unused.png')), false);
assert.equal(Boolean(optimizedZip.file('ppt/media/image2.png')), false);
assert.equal(Boolean(optimizedZip.file('ppt/printerSettings/printerSettings1.bin')), false);
const rels = await optimizedZip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
assert.match(rels, /Target="\.\.\/media\/image1\.png"/);
assert.doesNotMatch(rels, /image2\.png/);
const rootRels = await optimizedZip.file('_rels/.rels').async('string');
assert.doesNotMatch(rootRels, /thumbnail/);
const manifest = createPptCompressManifest(result);
assert.equal(manifest.bytes, undefined);
assert.equal(manifest.saved_bytes, result.saved_bytes);

const imageCompressed = await compressPptxBytes(pptx, {
  sourceName: 'demo.pptx',
  level: 'high',
  imageCompressor: async task => ({
    bytes: pseudoImageBytes(Math.max(1024, Math.floor(task.bytes.byteLength / 8))),
    extension: 'jpg',
    width: 1200,
    height: 675
  })
});
assert.equal(imageCompressed.operations.compressed_images, 1);
assert.equal(imageCompressed.image_compression_enabled, true);
assert.equal(imageCompressed.image_compression_available, true);
assert.ok(imageCompressed.operations.image_input_bytes > imageCompressed.operations.image_output_bytes);
const imageCompressedZip = await JSZip.loadAsync(imageCompressed.bytes);
assert.equal(Boolean(imageCompressedZip.file('ppt/media/image1.png')), false);
assert.equal(Boolean(imageCompressedZip.file('ppt/media/image1.jpg')), true);
const imageCompressedRels = await imageCompressedZip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
assert.match(imageCompressedRels, /Target="\.\.\/media\/image1\.jpg"/);
assert.doesNotMatch(imageCompressedRels, /image1\.png|image2\.png/);
const imageCompressedContentTypes = await imageCompressedZip.file('[Content_Types].xml').async('string');
assert.match(imageCompressedContentTypes, /Extension="jpg"\s+ContentType="image\/jpeg"/);

const low = await compressPptxBytes(pptx, { sourceName: 'demo.pptx', level: 'low' });
assert.equal(low.level, 'low');
assert.equal(low.operations.deduplicated_media, 0);
assert.equal(low.operations.removed_unused_media, 0);

await assert.rejects(
  () => compressPptxBytes(Buffer.from('not-a-pptx'), { sourceName: 'fake.pptx' }),
  error => error instanceof PptCompressError && error.code === 'invalid_pptx'
);

console.log('PPT compression core regression checks passed');
