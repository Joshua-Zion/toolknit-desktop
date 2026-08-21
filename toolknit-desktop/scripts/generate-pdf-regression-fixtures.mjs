import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const outputDir = path.resolve('.cache/pdf-fixtures');
await mkdir(outputDir, { recursive: true });

async function save(name, document) {
  const bytes = await document.save({ useObjectStreams: true });
  await writeFile(path.join(outputDir, name), bytes);
}

async function createEditorDocument() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const specs = [
    { size: [612, 792], rotation: 0, color: rgb(0.86, 0.2, 0.18), label: 'PAGE 1 / PORTRAIT' },
    { size: [420, 595], rotation: 90, color: rgb(0.1, 0.55, 0.34), label: 'PAGE 2 / SOURCE ROTATE 90' },
    { size: [792, 612], rotation: 0, color: rgb(0.12, 0.38, 0.78), label: 'PAGE 3 / LANDSCAPE' }
  ];
  for (const [index, spec] of specs.entries()) {
    const page = document.addPage(spec.size);
    page.setRotation(degrees(spec.rotation));
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 84, width, height: 84, color: spec.color });
    page.drawText(spec.label, { x: 32, y: height - 52, size: 18, font, color: rgb(1, 1, 1) });
    page.drawText(`Stable marker ${index + 1}`, { x: 32, y: 64, size: 14, font, color: rgb(0.08, 0.08, 0.08) });
  }
  document.setTitle('ToolKnit editor regression');
  return document;
}

async function createFormDocument() {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText('Interactive form regression', { x: 48, y: 730, size: 22, font });
  const form = document.getForm();
  const name = form.createTextField('customer.name');
  name.setText('ToolKnit');
  name.addToPage(page, { x: 48, y: 650, width: 240, height: 30 });
  const consent = form.createCheckBox('customer.consent');
  consent.check();
  consent.addToPage(page, { x: 48, y: 600, width: 20, height: 20 });
  form.updateFieldAppearances(font);
  document.setTitle('ToolKnit form structure regression');
  document.setAuthor('ToolKnit QA');
  return document;
}

async function createGrayCardDocument() {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const gray = 96 / 255;
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(gray, gray, gray) });
  page.drawRectangle({ x: 76, y: 220, width: 460, height: 350, borderWidth: 3, borderColor: rgb(0.08, 0.08, 0.08) });
  page.drawText('GRAY 96 / EDGE TARGET', { x: 130, y: 390, size: 24, font, color: rgb(0.08, 0.08, 0.08) });
  return document;
}

async function createA0Document() {
  const document = await PDFDocument.create();
  const page = document.addPage([2384, 3370]);
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawText('A0 RENDER BUDGET', { x: 160, y: 3100, size: 96, font, color: rgb(0.06, 0.06, 0.06) });
  for (let x = 160; x < 2224; x += 240) {
    page.drawLine({ start: { x, y: 240 }, end: { x, y: 2920 }, thickness: 4, color: rgb(0.72, 0.72, 0.72) });
  }
  for (let y = 240; y < 2920; y += 240) {
    page.drawLine({ start: { x: 160, y }, end: { x: 2224, y }, thickness: 4, color: rgb(0.72, 0.72, 0.72) });
  }
  return document;
}

async function createUnicodeMetadataDocument() {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Courier);
  page.drawText('UNICODE PASSWORD TARGET', { x: 48, y: 710, size: 20, font });
  document.setTitle('ToolKnit PDF 密码测试 🔐');
  document.setSubject('中文与 emoji 密码回归');
  return document;
}

async function createOptimizedVectorDocument() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 4; index++) {
    const page = document.addPage([612, 792]);
    for (let row = 0; row < 20; row++) {
      page.drawText(`Vector row ${row + 1} / page ${index + 1}`, {
        x: 48,
        y: 730 - row * 31,
        size: 11,
        font,
        color: rgb(0.12, 0.12, 0.12)
      });
    }
  }
  document.setTitle('Already compact vector PDF');
  return document;
}

await save('editor-three-pages.pdf', await createEditorDocument());
await save('form-metadata.pdf', await createFormDocument());
await save('gray-card.pdf', await createGrayCardDocument());
await save('a0-page.pdf', await createA0Document());
await save('unicode-metadata.pdf', await createUnicodeMetadataDocument());
await save('optimized-vector.pdf', await createOptimizedVectorDocument());

console.log(outputDir);
