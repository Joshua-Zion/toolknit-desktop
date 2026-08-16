import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  PPT_IMAGE_EXTRACT_LIMITS,
  PptImageExtractError,
  analyzePptxImages,
  createPptImageManifestMarkdown,
  normalizePptImageSelection,
  normalizePptPageSelection,
  planPptImageExport,
  readPptImageDimensions,
  sanitizePptImageBaseName
} from '../src/ppt-image-extract-core.js';

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);
const svg20x10 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#fff"/></svg>');

async function createFixturePptx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst>
</p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:pic><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rId1"/></p:pic></p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/_rels/slide1.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`);
  zip.file('ppt/slides/slide2.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:pic><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rId1"/></p:pic><p:pic><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rId2"/></p:pic></p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/_rels/slide2.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.svg"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`);
  zip.file('ppt/media/image1.png', png1x1);
  zip.file('ppt/media/image2.svg', svg20x10);
  zip.file('ppt/media/unreferenced.svg', svg20x10);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

assert.equal(PPT_IMAGE_EXTRACT_LIMITS.maxInputBytes, 200 * 1024 * 1024);
assert.deepEqual(readPptImageDimensions(png1x1, 'png'), { width: 1, height: 1 });
assert.deepEqual(readPptImageDimensions(svg20x10, 'svg'), { width: 20, height: 10 });
assert.equal(sanitizePptImageBaseName('..\\demo:name.pptx'), 'demo_name');

const pptx = await createFixturePptx();
const manifest = await analyzePptxImages(pptx, { sourceName: 'demo.pptx' });
assert.equal(manifest.slide_count, 2);
assert.equal(manifest.media_count, 3);
assert.equal(manifest.image_count, 4);
assert.equal(manifest.images[0].slide_number, 1);
assert.equal(manifest.images[0].media_path, 'ppt/media/image1.png');
assert.equal(manifest.images[1].slide_number, 2);
assert.equal(manifest.images[1].extension, 'svg');
assert.equal(manifest.images[2].duplicate_of, '001');
assert.equal(manifest.images[3].slide_number, null);
assert.equal(manifest.duplicate_count, 2);

assert.deepEqual(normalizePptImageSelection('1,3-4', 4), [1, 3, 4]);
assert.deepEqual(normalizePptPageSelection([2, 1], 2), [1, 2]);
assert.throws(() => normalizePptImageSelection('2-1', 4), error => error instanceof PptImageExtractError && error.code === 'invalid_selection');

const pagePlan = planPptImageExport(manifest, { pages: [2], skip_duplicates: true });
assert.equal(pagePlan.selected_count, 1);
assert.equal(pagePlan.selected_images[0].id, '002');
assert.equal(pagePlan.skipped_duplicates, 2);

const imagePlan = planPptImageExport(manifest, { images: [1, 4] });
assert.equal(imagePlan.selected_count, 2);
assert.equal(imagePlan.selected_bytes, png1x1.length + svg20x10.length);

const markdown = createPptImageManifestMarkdown({ ...manifest, input: { path: 'demo.pptx' } });
assert.match(markdown, /PPT 图片提取清单/);
assert.match(markdown, /001/);
assert.match(markdown, /未定位/);

await assert.rejects(
  () => analyzePptxImages(Buffer.from('not-a-pptx'), { sourceName: 'fake.pptx' }),
  error => error instanceof PptImageExtractError && error.code === 'invalid_pptx'
);

console.log('PPT image extraction core regression checks passed');

