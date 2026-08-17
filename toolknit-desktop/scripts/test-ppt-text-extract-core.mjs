import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  PptTextExtractError,
  analyzePptxText,
  buildPptTextAiMessages,
  createPptTextMarkdown,
  createPptTextTxt,
  normalizePptTextAiMode,
  normalizePptTextFormat,
  normalizePptTextPageSelection,
  planPptTextExport,
  sanitizePptTextBaseName
} from '../src/ppt-text-extract-core.js';

async function createFixturePptx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
</Types>`);
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst>
</p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>AI 产品路线 &amp; 目标</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 1"/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>第一阶段：验证 PPT 文本提取。</a:t></a:r></a:p><a:p><a:buChar char="•"/><a:r><a:t>保留备注和页码。</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:nvSpPr><p:cNvPr id="4" name="Footer"/><p:nvPr><p:ph type="ftr"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>不应出现的页脚</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/_rels/slide1.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`);
  zip.file('ppt/notesSlides/notesSlide1.xml', `<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder"/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>讲解时强调：文件不上传服务器。</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld></p:notes>`);
  zip.file('ppt/slides/slide2.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Agenda"/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>第二页没有标准标题占位。</a:t></a:r></a:p><a:p><a:r><a:t>但应该用首个文本块兜底。</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld></p:sld>`);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

assert.equal(sanitizePptTextBaseName('..\\demo:name.pptx'), 'demo_name');
assert.equal(normalizePptTextFormat('md'), 'markdown');
assert.equal(normalizePptTextFormat('text'), 'txt');
assert.equal(normalizePptTextAiMode('notes'), 'speaker-notes');
assert.deepEqual(normalizePptTextPageSelection('1,2', 2), [1, 2]);

const pptx = await createFixturePptx();
const manifest = await analyzePptxText(pptx, { sourceName: 'demo.pptx' });
assert.equal(manifest.slide_count, 2);
assert.equal(manifest.slides[0].page, 1);
assert.equal(manifest.slides[0].source_slide_number, 1);
assert.equal(manifest.slides[0].title, 'AI 产品路线 & 目标');
assert.equal(manifest.slides[0].body.length, 2);
assert.equal(manifest.slides[0].body[1], '• 保留备注和页码。');
assert.equal(manifest.slides[0].notes[0], '讲解时强调：文件不上传服务器。');
assert.equal(manifest.slides[0].has_notes, true);
assert.equal(manifest.slides[0].body.some(item => item.includes('页脚')), false);
assert.equal(manifest.slides[1].title, '第二页没有标准标题占位。\n但应该用首个文本块兜底。');
assert.equal(manifest.notes_slide_count, 1);

const plan = planPptTextExport(manifest, { pages: [1], format: 'all', ai_mode: 'outline' });
assert.equal(plan.selected_count, 1);
assert.equal(plan.selected_slides[0].title, 'AI 产品路线 & 目标');
assert.equal(plan.format, 'all');
assert.equal(plan.ai_mode, 'outline');

const markdown = createPptTextMarkdown({ ...manifest, input: { path: 'demo.pptx' }, selected_slides: plan.selected_slides });
assert.match(markdown, /PPT 文本提取/);
assert.match(markdown, /讲解时强调/);
const txt = createPptTextTxt({ ...manifest, input: { path: 'demo.pptx' }, selected_slides: plan.selected_slides });
assert.match(txt, /第 1 页/);

const aiMessages = buildPptTextAiMessages({ ...manifest, selected_slides: plan.selected_slides }, { ai_mode: 'outline' });
assert.equal(aiMessages.messages.length, 2);
assert.match(aiMessages.messages[1].content, /文件不上传服务器/);

await assert.rejects(
  () => analyzePptxText(Buffer.from('not-a-pptx'), { sourceName: 'fake.pptx' }),
  error => error instanceof PptTextExtractError && error.code === 'invalid_pptx'
);

console.log('PPT text extraction core regression checks passed');

