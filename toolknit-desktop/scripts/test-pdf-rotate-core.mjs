import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, degrees } from 'pdf-lib';
import pdfLibPlusEncrypt from 'pdf-lib-plus-encrypt';
import { rotatePdf } from '../cli/lib/pdf-runtime.mjs';
import { ToolKnitError } from '../cli/lib/errors.mjs';
import {
  PDF_ROTATE_LIMITS,
  assertPdfRotateInput,
  assertPdfRotatePageCount,
  assertPdfRotateSelection,
  createPdfRotateFileName,
  normalizePdfRotation,
  rotatePdfPages
} from '../src/pdf-rotate-core.js';

const { PDFDocument: EncryptedPDFDocument } = pdfLibPlusEncrypt;

async function createPdf(pageSpecs) {
  const document = await PDFDocument.create();
  for (const [width, height, rotation] of pageSpecs) {
    const page = document.addPage([width, height]);
    page.setRotation(degrees(rotation));
  }
  return document.save();
}

const source = await createPdf([[612, 792, 0], [420, 595, 90], [842, 595, 180]]);
const progress = [];
const rotated = await rotatePdfPages({
  fileData: source,
  pages: [
    { pageIndex: 1, rotation: 90 },
    { pageIndex: 2, rotation: 270 },
    { pageIndex: 3, rotation: 180 }
  ],
  onProgress: update => progress.push(update.completed)
});
const rotatedDocument = await PDFDocument.load(rotated);

assert.equal(rotatedDocument.getPageCount(), 3);
assert.deepEqual(rotatedDocument.getPage(0).getSize(), { width: 612, height: 792 });
assert.equal(rotatedDocument.getPage(0).getRotation().angle, 90);
assert.deepEqual(rotatedDocument.getPage(1).getSize(), { width: 420, height: 595 });
assert.equal(rotatedDocument.getPage(1).getRotation().angle, 0);
assert.equal(rotatedDocument.getPage(2).getRotation().angle, 0);
assert.deepEqual(progress, [1, 2, 3]);

const formSourceDocument = await PDFDocument.create();
const formPage = formSourceDocument.addPage([612, 792]);
const form = formSourceDocument.getForm();
const formField = form.createTextField('profile.name');
formField.setText('ToolKnit');
formField.addToPage(formPage, { x: 48, y: 680, width: 220, height: 28 });
formSourceDocument.setTitle('Rotation structure regression');
const formSource = await formSourceDocument.save();
const rotatedFormBytes = await rotatePdfPages({
  fileData: formSource,
  pages: [{ pageIndex: 1, rotation: 90 }]
});
const rotatedForm = await PDFDocument.load(rotatedFormBytes);
assert.equal(rotatedForm.getPage(0).getRotation().angle, 90);
assert.equal(rotatedForm.getTitle(), 'Rotation structure regression');
assert.deepEqual(rotatedForm.getForm().getFields().map(field => field.getName()), ['profile.name']);

const extractedFormSource = await PDFDocument.create();
const extractedFormPage = extractedFormSource.addPage([612, 792]);
extractedFormSource.addPage([420, 595]);
const extractedField = extractedFormSource.getForm().createTextField('profile.extract');
extractedField.setText('ToolKnit');
extractedField.addToPage(extractedFormPage, { x: 48, y: 680, width: 220, height: 28 });
const extractedFormBytes = await rotatePdfPages({
  fileData: await extractedFormSource.save(),
  pages: [{ pageIndex: 1, rotation: 90 }]
});
const extractedForm = await PDFDocument.load(extractedFormBytes);
assert.equal(extractedForm.getForm().getFields().length, 0);
assert.equal(extractedForm.getPage(0).node.Annots()?.size() || 0, 0);

assert.equal(normalizePdfRotation(-90), 270);
assert.throws(() => normalizePdfRotation(45));
assert.equal(createPdfRotateFileName('..\\unsafe/name.pdf'), 'name_rotated.pdf');
assert.equal(createPdfRotateFileName('report.pdf', 2), 'report_page_2_rotated.pdf');
assert.throws(() => createPdfRotateFileName('report.pdf', 0));
assert.throws(() => assertPdfRotateSelection([], 10));
assert.throws(() => assertPdfRotateSelection([{}], PDF_ROTATE_LIMITS.maxInputBytes + 1));
assert.throws(() => assertPdfRotateInput(new Uint8Array()));
assert.throws(() => assertPdfRotatePageCount(PDF_ROTATE_LIMITS.maxPreviewPages + 1));
await assert.rejects(() => rotatePdfPages({
  fileData: source,
  pages: [{ pageIndex: 4, rotation: 0 }]
}));

const encrypted = await EncryptedPDFDocument.create();
encrypted.addPage([612, 792]);
encrypted.encrypt({ userPassword: 'rotate-test', ownerPassword: 'rotate-test' });
const encryptedBytes = await encrypted.save({ useObjectStreams: false });
await assert.rejects(() => rotatePdfPages({
  fileData: encryptedBytes,
  pages: [{ pageIndex: 1, rotation: 90 }]
}));

const runtimeDirectory = await mkdtemp(path.join(os.tmpdir(), 'toolknit-pdf-rotate-'));
try {
  const inputPath = path.join(runtimeDirectory, 'three-pages.pdf');
  const outputPath = path.join(runtimeDirectory, 'partial-rotation.pdf');
  await writeFile(inputPath, source);

  const result = await rotatePdf({
    input_path: inputPath,
    output_path: outputPath,
    page_rotations: [{ page: 2, rotation: 90 }]
  });
  const outputDocument = await PDFDocument.load(await readFile(outputPath));

  assert.equal(result.outputs[0].pages, 3);
  assert.equal(outputDocument.getPageCount(), 3);
  assert.deepEqual(outputDocument.getPages().map(page => page.getSize()), [
    { width: 612, height: 792 },
    { width: 420, height: 595 },
    { width: 842, height: 595 }
  ]);
  assert.deepEqual(outputDocument.getPages().map(page => page.getRotation().angle), [0, 180, 180]);

  for (const pageRotations of [
    [{ page: 2, rotation: 90 }, { page: 2, rotation: 180 }],
    [{ page: 4, rotation: 90 }],
    [{ page: 2, rotation: 45 }]
  ]) {
    await assert.rejects(
      () => rotatePdf({
        input_path: inputPath,
        output_path: path.join(runtimeDirectory, 'invalid.pdf'),
        page_rotations: pageRotations
      }),
      error => error instanceof ToolKnitError && error.code === 'INVALID_ARGUMENT'
    );
  }
} finally {
  await rm(runtimeDirectory, { recursive: true, force: true });
}

console.log('PDF rotate core regression checks passed');
