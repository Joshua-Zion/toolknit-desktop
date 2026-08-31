import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  PDF_PAGE_NUMBER_LIMITS,
  assertPdfPageNumberPageCount,
  assertPdfPageNumberSelection,
  buildPdfPageNumberPlan,
  calculatePdfPageNumberLayout,
  createPdfPageNumberFileName,
  exportPdfWithPageNumbers,
  formatPdfPageNumber,
  getPdfPageDisplayGeometry,
  parsePdfPageRange,
  splitNumberedPdfPages,
  visualPdfPointToPagePoint
} from '../src/pdf-page-number-core.js';

async function createPdf(specs) {
  const document = await PDFDocument.create();
  specs.forEach(([width, height, rotation]) => {
    const page = document.addPage([width, height]);
    page.setRotation(degrees(rotation));
  });
  return document.save();
}

assert.deepEqual([...parsePdfPageRange('1-3, 6，8', 8)], [1, 2, 3, 6, 8]);
assert.throws(() => parsePdfPageRange('0-2', 8));
assert.throws(() => parsePdfPageRange('5-3', 8));
assert.equal(formatPdfPageNumber(3, 'padded-2'), '03');
assert.equal(formatPdfPageNumber(14, 'roman-upper'), 'XIV');
assert.equal(formatPdfPageNumber(28, 'alpha-lower'), 'ab');
assert.equal(createPdfPageNumberFileName('..\\unsafe/report.pdf'), 'report_numbered.pdf');
assert.equal(createPdfPageNumberFileName('report', 'zip'), 'report_numbered.zip');
assert.throws(() => assertPdfPageNumberSelection([], 0));
assert.throws(() => assertPdfPageNumberSelection([{ name: 'a.pdf' }], PDF_PAGE_NUMBER_LIMITS.maxTotalBytes + 1));
assert.throws(() => assertPdfPageNumberPageCount(PDF_PAGE_NUMBER_LIMITS.maxPages + 1));

const pages = [
  { id: 'a1', sourceId: 'a', sourcePageIndex: 0 },
  { id: 'a2', sourceId: 'a', sourcePageIndex: 1 },
  { id: 'b1', sourceId: 'b', sourcePageIndex: 0 },
  { id: 'b2', sourceId: 'b', sourcePageIndex: 1 }
];
const continuousPlan = buildPdfPageNumberPlan(pages, {
  skipFirst: 1,
  start: 5,
  step: 2,
  scope: 'odd',
  template: '{page} / {total}'
});
assert.deepEqual(continuousPlan.map(item => item.text), ['5 / 3', '5 / 3', '7 / 3', '9 / 3']);
assert.deepEqual(continuousPlan.map(item => item.applied), [false, false, true, false]);

const sourcePlan = buildPdfPageNumberPlan(pages, {
  numberingMode: 'source',
  scope: 'selected',
  selectedIds: ['a2', 'b1'],
  template: '{page}:{sourcePage}:{total}'
});
assert.deepEqual(sourcePlan.map(item => item.text), ['1:1:2', '2:2:2', '1:1:2', '2:2:2']);
assert.deepEqual(sourcePlan.map(item => item.applied), [false, true, true, false]);

const layout = calculatePdfPageNumberLayout({
  pageWidth: 600,
  pageHeight: 800,
  textWidth: 42,
  textHeight: 12,
  settings: { position: 'top-right', backgroundStyle: 'pill', margin: 24, padding: 8 }
});
assert.equal(layout.background.x, 600 - 24 - layout.background.width);
assert.equal(layout.background.y, 800 - 24 - layout.background.height);

const pageGeometryDocument = await PDFDocument.create();
const rotatedPage = pageGeometryDocument.addPage([420, 595]);
rotatedPage.setRotation(degrees(90));
assert.deepEqual(getPdfPageDisplayGeometry(rotatedPage), {
  box: { x: 0, y: 0, width: 420, height: 595 },
  rotation: 90,
  width: 595,
  height: 420
});
assert.deepEqual(visualPdfPointToPagePoint({ x: 10, y: 20, width: 420, height: 595 }, 90, 30, 40), { x: 390, y: 50 });

const sourceA = await createPdf([[612, 792, 0], [420, 595, 90]]);
const sourceB = await createPdf([[842, 595, 270]]);
const progress = [];
const numbered = await exportPdfWithPageNumbers({
  sources: [
    { id: 'a', bytes: sourceA },
    { id: 'b', bytes: sourceB }
  ],
  pages: [pages[1], pages[2], pages[0]],
  settings: {
    template: 'Page {page} / {total}',
    position: 'bottom-center',
    backgroundStyle: 'pill',
    borderWidth: 1
  },
  onProgress: update => progress.push(update.percent)
});
const numberedDocument = await PDFDocument.load(numbered);
assert.equal(numberedDocument.getPageCount(), 3);
assert.deepEqual(numberedDocument.getPages().map(page => page.getRotation().angle), [90, 270, 0]);
assert.ok(numberedDocument.getPages().every(page => page.node.Contents()?.size() > 0));
assert.equal(progress.at(-1), 100);

const split = await splitNumberedPdfPages({ bytes: numbered, baseName: 'report.pdf' });
assert.deepEqual(split.map(item => item.fileName), ['report_page-1.pdf', 'report_page-2.pdf', 'report_page-3.pdf']);
for (const output of split) assert.equal((await PDFDocument.load(output.bytes)).getPageCount(), 1);

const formSource = await PDFDocument.create();
const formPage = formSource.addPage([612, 792]);
const formField = formSource.getForm().createTextField('page-number.profile');
formField.setText('ToolKnit');
formField.addToPage(formPage, { x: 48, y: 680, width: 220, height: 28 });
const numberedFormBytes = await exportPdfWithPageNumbers({
  sources: [{ id: 'form', bytes: await formSource.save() }],
  pages: [{ id: 'form-1', sourceId: 'form', sourcePageIndex: 0 }],
  settings: { backgroundStyle: 'bar', position: 'bottom-center' }
});
const numberedForm = await PDFDocument.load(numberedFormBytes);
assert.equal(numberedForm.getForm().getFields().length, 0);
assert.equal(numberedForm.getPage(0).node.Annots()?.size() || 0, 0);

await assert.rejects(() => exportPdfWithPageNumbers({
  sources: [{ id: 'a', bytes: sourceA }],
  pages: [{ id: 'missing', sourceId: 'a', sourcePageIndex: 9 }]
}));
await assert.rejects(() => exportPdfWithPageNumbers({
  sources: [{ id: 'a', bytes: sourceA }],
  pages: [{ id: 'a1', sourceId: 'a', sourcePageIndex: 0 }],
  shouldCancel: () => true
}), error => error?.name === 'PdfPageNumberCancelledError');

console.log('PDF page-number core regression checks passed');
