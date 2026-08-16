import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import {
  PDF_EDITOR_LIMITS,
  assertPdfEditorFile,
  assertPdfEditorPageCount,
  assertPdfEditorMergeSelection,
  normalizePageRotation,
  sanitizePdfBaseName,
  buildPdfName,
  assemblePdf,
  assemblePdfWithTextEdits,
  splitPdfPages
} from '../src/pdf-editor-core.js';

async function createPdf(pageSpecs) {
  const document = await PDFDocument.create();
  for (const [width, height, rotation] of pageSpecs) {
    const page = document.addPage([width, height]);
    page.setRotation(degrees(rotation));
  }
  return document.save();
}

const sourceA = await createPdf([[612, 792, 0], [612, 792, 0]]);
const sourceB = await createPdf([[420, 595, 0]]);

const assembled = await assemblePdf({
  sources: [{ name: 'a.pdf', bytes: sourceA }, { name: 'b.pdf', bytes: sourceB }],
  pages: [
    { sourceIndex: 1, pageIndex: 0, rotation: 0 },
    { sourceIndex: 0, pageIndex: 1, rotation: 90 },
    { sourceIndex: 0, pageIndex: 0, rotation: 0 }
  ],
  onProgress: () => {}
});
const assembledDocument = await PDFDocument.load(assembled);
assert.equal(assembledDocument.getPageCount(), 3);
assert.deepEqual(assembledDocument.getPage(0).getSize(), { width: 420, height: 595 });
assert.equal(assembledDocument.getPage(1).getRotation().angle, 90);
assert.deepEqual(assembledDocument.getPage(2).getSize(), { width: 612, height: 792 });

const split = await splitPdfPages({
  sources: [{ name: 'a.pdf', bytes: sourceA }],
  pages: [
    { sourceIndex: 0, pageIndex: 0, rotation: 0 },
    { sourceIndex: 0, pageIndex: 1, rotation: 0 }
  ],
  onPage: () => {}
});
assert.equal(split.length, 2);
for (const bytes of split) {
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
}

// Text editing path: cover original glyphs and redraw replacement text without
// changing page count, page size or rotation.
const textSource = await (async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText('Hello World', { x: 100, y: 700, size: 24, font });
  return document.save();
})();

const edited = await assemblePdfWithTextEdits({
  sources: [{ name: 'text.pdf', bytes: textSource }],
  pages: [{ sourceIndex: 0, pageIndex: 0, rotation: 0 }],
  textEdits: [{
    pageIndex: 0,
    baselineX: 100,
    baselineY: 700,
    fontSize: 24,
    text: 'Hi there',
    box: { x: 99, y: 695, width: 124, height: 26 }
  }],
  onProgress: () => {}
});
const editedDocument = await PDFDocument.load(edited);
assert.equal(editedDocument.getPageCount(), 1);
assert.deepEqual(editedDocument.getPage(0).getSize(), { width: 612, height: 792 });

const tinyPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
));
const inserted = await assemblePdfWithTextEdits({
  sources: [{ name: 'insert.pdf', bytes: textSource }],
  pages: [{ sourceIndex: 0, pageIndex: 0, rotation: 0 }],
  textObjects: [{ pageIndex: 0, x: 120, y: 620, text: 'Inserted', fontSize: 16 }],
  imageObjects: [{ pageIndex: 0, x: 220, y: 600, width: 32, height: 32, bytes: tinyPng, mimeType: 'image/png' }],
  onProgress: () => {}
});
const insertedDocument = await PDFDocument.load(inserted);
assert.equal(insertedDocument.getPageCount(), 1);
assert.ok(inserted.length > textSource.length);

assert.equal(normalizePageRotation(-90), 270);
assert.equal(normalizePageRotation(450), 90);
assert.equal(sanitizePdfBaseName('C:\\Docs\\A/B:c.pdf'), 'B_c');
assert.equal(buildPdfName('report.pdf', 'edited'), 'report_edited.pdf');

assert.throws(() => assertPdfEditorFile('notes.txt', 10));
assert.throws(() => assertPdfEditorFile('big.pdf', PDF_EDITOR_LIMITS.maxInputBytes + 1));
assert.throws(() => assertPdfEditorPageCount(0));
assert.throws(() => assertPdfEditorPageCount(PDF_EDITOR_LIMITS.maxPages + 1));
assert.throws(() => assertPdfEditorMergeSelection([], 0));
assert.throws(() => assertPdfEditorMergeSelection([{}], PDF_EDITOR_LIMITS.maxMergeTotalBytes + 1));

console.log('PDF editor core regression checks passed');
