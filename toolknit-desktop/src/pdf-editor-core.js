import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import fontkit from './pdf-lib-fontkit.js';
import { encryptPdf as encryptPdfBytes, normalizePdfEncryptPermissions } from './pdf-encrypt-core.js';

export const PDF_EDITOR_LIMITS = Object.freeze({
  maxInputBytes: 150 * 1024 * 1024,
  maxPages: 500,
  maxMergeFiles: 25,
  maxMergeTotalBytes: 150 * 1024 * 1024
});

export function assertPdfEditorFile(name, size, limits = PDF_EDITOR_LIMITS) {
  if (!/\.pdf$/i.test(String(name || ''))) {
    throw new Error('A PDF file is required');
  }
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new Error('Invalid PDF file size');
  }
  if (size > limits.maxInputBytes) {
    throw new Error(`PDF input exceeds the ${Math.floor(limits.maxInputBytes / 1024 / 1024)}MB editor limit`);
  }
}

export function assertPdfEditorPageCount(count, limits = PDF_EDITOR_LIMITS) {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('PDF has no pages');
  }
  if (count > limits.maxPages) {
    throw new Error(`PDF input exceeds the ${limits.maxPages}-page editor limit`);
  }
}

export function assertPdfEditorMergeSelection(sources, totalBytes, limits = PDF_EDITOR_LIMITS) {
  if (!Array.isArray(sources) || sources.length < 1) {
    throw new Error('No PDF source is available');
  }
  if (sources.length > limits.maxMergeFiles) {
    throw new Error(`PDF editor accepts at most ${limits.maxMergeFiles} files at a time`);
  }
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) {
    throw new Error('Invalid PDF source size');
  }
  if (totalBytes > limits.maxMergeTotalBytes) {
    throw new Error(`PDF inputs exceed the ${Math.floor(limits.maxMergeTotalBytes / 1024 / 1024)}MB merge limit`);
  }
}

export function normalizePageRotation(value) {
  const number = Number(value) || 0;
  return ((number % 360) + 360) % 360;
}

export function sanitizePdfBaseName(sourceName) {
  const baseName = String(sourceName || 'document.pdf')
    .split(/[\\/]/)
    .pop()
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'document';
  return baseName;
}

export function buildPdfName(sourceName, suffix) {
  return `${sanitizePdfBaseName(sourceName)}_${String(suffix || 'edited')}.pdf`;
}

async function loadPdfLibDocument(bytes) {
  return PDFDocument.load(bytes.slice());
}

/**
 * Assemble an ordered page list into a single PDF document.
 *
 * @param {object} params
 * @param {Array<{ name: string, bytes: Uint8Array }>} params.sources
 * @param {Array<{ sourceIndex: number, pageIndex: number, rotation: number }>} params.pages
 * @param {boolean} [params.useObjectStreams]
 * @param {(info: { done: number, total: number }) => void} [params.onProgress]
 * @returns {Promise<Uint8Array>}
 */
export async function assemblePdf({ sources, pages, useObjectStreams = true, onProgress }) {
  if (!Array.isArray(sources) || !Array.isArray(pages) || pages.length === 0) {
    throw new Error('No PDF pages are available to assemble');
  }

  const output = await PDFDocument.create();
  const sourceCache = new Map();

  for (let index = 0; index < pages.length; index++) {
    const pageRef = pages[index];
    const source = sources[pageRef.sourceIndex];
    if (!source?.bytes?.length) {
      throw new Error(`Missing PDF data for source index ${pageRef.sourceIndex}`);
    }
    if (!Number.isInteger(pageRef.pageIndex) || pageRef.pageIndex < 0) {
      throw new Error(`Invalid page index for source index ${pageRef.sourceIndex}`);
    }

    let sourceDoc = sourceCache.get(pageRef.sourceIndex);
    if (!sourceDoc) {
      sourceDoc = await loadPdfLibDocument(source.bytes);
      sourceCache.set(pageRef.sourceIndex, sourceDoc);
    }
    if (pageRef.pageIndex >= sourceDoc.getPageCount()) {
      throw new Error(`Page ${pageRef.pageIndex + 1} is outside source index ${pageRef.sourceIndex}`);
    }

    const [copiedPage] = await output.copyPages(sourceDoc, [pageRef.pageIndex]);
    copiedPage.setRotation(degrees(
      copiedPage.getRotation().angle + normalizePageRotation(pageRef.rotation)
    ));
    output.addPage(copiedPage);
    onProgress?.({ done: index + 1, total: pages.length });
  }

  return output.save({ useObjectStreams });
}

const CJK_TEXT_RE = /[\u2E80-\u2EFF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

function normalizeTextColor(color) {
  if (Array.isArray(color) && color.length >= 3) {
    return rgb(
      Math.max(0, Math.min(1, Number(color[0]) || 0)),
      Math.max(0, Math.min(1, Number(color[1]) || 0)),
      Math.max(0, Math.min(1, Number(color[2]) || 0))
    );
  }
  return rgb(0, 0, 0);
}

function rotatePointAround(x, y, cx, cy, rotationDegrees) {
  const rad = (Number(rotationDegrees) || 0) * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos
  };
}

/**
 * Assemble an ordered page list and apply text-line edits by covering the
 * original glyphs with a white rectangle, then redrawing the replacement text
 * with an embedded font. Edit coordinates must be expressed in the page's
 * untransformed PDF user space (the same space returned by pdf.js
 * `getTextContent()`), which is also the space pdf-lib draws into before the
 * page rotation is applied.
 *
 * @param {object} params
 * @param {Array<{ name: string, bytes: Uint8Array }>} params.sources
 * @param {Array<{ sourceIndex: number, pageIndex: number, rotation: number }>} params.pages
 * @param {Array<{ pageIndex: number, baselineX: number, baselineY: number, fontSize: number, text: string, bold?: boolean, italic?: boolean, rotation?: number, box?: { x: number, y: number, width: number, height: number }, color?: number[] }>} [params.textEdits]
 * @param {Array<{ pageIndex: number, x: number, y: number, text: string, fontSize?: number, bold?: boolean, rotation?: number, color?: number[] }>} [params.textObjects]
 * @param {Array<{ pageIndex: number, x: number, y: number, width: number, height: number, rotation?: number, bytes: Uint8Array, mimeType?: string }>} [params.imageObjects]
 * @param {Array<{ pageIndex: number, shapeType: 'rect'|'ellipse'|'line', x: number, y: number, width: number, height: number, rotation?: number, fill?: number[]|null, stroke?: number[]|null, strokeWidth?: number }>} [params.shapeObjects]
 * @param {Uint8Array} [params.fontRegularBytes]
 * @param {Uint8Array} [params.fontSemiboldBytes]
 * @param {boolean} [params.useObjectStreams]
 * @param {(info: { done: number, total: number }) => void} [params.onProgress]
 * @returns {Promise<Uint8Array>}
 */
export async function assemblePdfWithTextEdits({
  sources,
  pages,
  textEdits = [],
  textObjects = [],
  imageObjects = [],
  shapeObjects = [],
  fontRegularBytes,
  fontSemiboldBytes,
  useObjectStreams = true,
  onProgress
}) {
  if (!Array.isArray(sources) || !Array.isArray(pages) || pages.length === 0) {
    throw new Error('No PDF pages are available to assemble');
  }

  const edits = Array.isArray(textEdits) ? textEdits : [];
  const insertedTexts = Array.isArray(textObjects) ? textObjects : [];
  const insertedImages = Array.isArray(imageObjects) ? imageObjects : [];
  const insertedShapes = Array.isArray(shapeObjects) ? shapeObjects : [];
  const output = await PDFDocument.create();
  if (edits.length || insertedTexts.length) output.registerFontkit(fontkit);

  const sourceCache = new Map();
  const editsByPageIndex = new Map();
  for (const edit of edits) {
    const pageIndex = Number(edit?.pageIndex);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) continue;
    const list = editsByPageIndex.get(pageIndex) || [];
    list.push(edit);
    editsByPageIndex.set(pageIndex, list);
  }
  const textObjectsByPageIndex = new Map();
  for (const object of insertedTexts) {
    const pageIndex = Number(object?.pageIndex);
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || !String(object?.text ?? '').length) continue;
    const list = textObjectsByPageIndex.get(pageIndex) || [];
    list.push(object);
    textObjectsByPageIndex.set(pageIndex, list);
  }
  const imageObjectsByPageIndex = new Map();
  for (const object of insertedImages) {
    const pageIndex = Number(object?.pageIndex);
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || !object?.bytes?.length) continue;
    const list = imageObjectsByPageIndex.get(pageIndex) || [];
    list.push(object);
    imageObjectsByPageIndex.set(pageIndex, list);
  }
  const shapeObjectsByPageIndex = new Map();
  for (const object of insertedShapes) {
    const pageIndex = Number(object?.pageIndex);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) continue;
    const list = shapeObjectsByPageIndex.get(pageIndex) || [];
    list.push(object);
    shapeObjectsByPageIndex.set(pageIndex, list);
  }

  let regularFont = null;
  let semiboldFont = null;
  let helvetica = null;
  let helveticaBold = null;
  let helveticaOblique = null;

  async function ensureFont(text, bold, italic) {
    if (CJK_TEXT_RE.test(text)) {
      if (bold && fontSemiboldBytes?.length) {
        semiboldFont = semiboldFont || await output.embedFont(fontSemiboldBytes, { subset: true });
        return semiboldFont;
      }
      if (fontRegularBytes?.length) {
        regularFont = regularFont || await output.embedFont(fontRegularBytes, { subset: true });
      } else {
        regularFont = regularFont || await output.embedFont(StandardFonts.Helvetica);
      }
      return regularFont;
    }

    helvetica = helvetica || await output.embedFont(StandardFonts.Helvetica);
    if (bold) {
      helveticaBold = helveticaBold || await output.embedFont(StandardFonts.HelveticaBold);
      return helveticaBold;
    }
    if (italic) {
      helveticaOblique = helveticaOblique || await output.embedFont(StandardFonts.HelveticaOblique);
      return helveticaOblique;
    }
    return helvetica;
  }

  const imageCache = new Map();
  async function ensureImage(object) {
    const key = object.bytes;
    if (imageCache.has(key)) return imageCache.get(key);
    const mimeType = String(object.mimeType || '').toLowerCase();
    const image = mimeType.includes('jpeg') || mimeType.includes('jpg')
      ? await output.embedJpg(object.bytes)
      : await output.embedPng(object.bytes);
    imageCache.set(key, image);
    return image;
  }

  for (let index = 0; index < pages.length; index++) {
    const pageRef = pages[index];
    const source = sources[pageRef.sourceIndex];
    if (!source?.bytes?.length) {
      throw new Error(`Missing PDF data for source index ${pageRef.sourceIndex}`);
    }
    if (!Number.isInteger(pageRef.pageIndex) || pageRef.pageIndex < 0) {
      throw new Error(`Invalid page index for source index ${pageRef.sourceIndex}`);
    }

    let sourceDoc = sourceCache.get(pageRef.sourceIndex);
    if (!sourceDoc) {
      sourceDoc = await loadPdfLibDocument(source.bytes);
      sourceCache.set(pageRef.sourceIndex, sourceDoc);
    }
    if (pageRef.pageIndex >= sourceDoc.getPageCount()) {
      throw new Error(`Page ${pageRef.pageIndex + 1} is outside source index ${pageRef.sourceIndex}`);
    }

    const [copiedPage] = await output.copyPages(sourceDoc, [pageRef.pageIndex]);

    for (const edit of editsByPageIndex.get(index) || []) {
      const text = String(edit?.text ?? '');
      const fontSize = Math.max(1, Number(edit?.fontSize) || 10);
      const baselineX = Number(edit?.baselineX) || 0;
      const baselineY = Number(edit?.baselineY) || 0;
      const bold = Boolean(edit?.bold);
      const italic = Boolean(edit?.italic);
      const font = await ensureFont(text, bold, italic);

      const box = edit?.box || {};
      const originalWidth = Math.max(0, Number(box.width) || 0);
      const coverX = Number.isFinite(Number(box.x)) ? Number(box.x) : baselineX;
      const coverY = Number.isFinite(Number(box.y)) ? Number(box.y) : baselineY - fontSize * 0.2;
      const coverHeight = Math.max(fontSize, Number(box.height) || fontSize * 1.05);
      // Keep the mask tied to the immutable source box. A longer replacement
      // must not expand the old-text mask into neighboring content.
      const coverWidth = originalWidth || Math.max(1, font.widthOfTextAtSize(text, fontSize));

      copiedPage.drawRectangle({
        x: coverX,
        y: coverY,
        width: coverWidth + fontSize * 0.08,
        height: coverHeight,
        color: rgb(1, 1, 1)
      });

      if (text.length) {
        copiedPage.drawText(text, {
          x: baselineX,
          y: baselineY,
          size: fontSize,
          font,
          rotate: degrees(Number(edit?.rotation) || 0),
          color: normalizeTextColor(edit?.color)
        });
      }
    }

    for (const object of textObjectsByPageIndex.get(index) || []) {
      const text = String(object.text ?? '');
      if (!text) continue;
      const fontSize = Math.max(1, Number(object.fontSize) || 16);
      const font = await ensureFont(text, Boolean(object.bold), false);
      copiedPage.drawText(text, {
        x: Number(object.x) || 0,
        y: Number(object.y) || 0,
        size: fontSize,
        font,
        rotate: degrees(Number(object.rotation) || 0),
        color: normalizeTextColor(object.color)
      });
    }

    for (const object of imageObjectsByPageIndex.get(index) || []) {
      const image = await ensureImage(object);
      copiedPage.drawImage(image, {
        x: Number(object.x) || 0,
        y: Number(object.y) || 0,
        width: Math.max(1, Number(object.width) || 1),
        height: Math.max(1, Number(object.height) || 1),
        rotate: degrees(Number(object.rotation) || 0)
      });
    }

    for (const object of shapeObjectsByPageIndex.get(index) || []) {
      const shapeType = ['rect', 'ellipse', 'line'].includes(object.shapeType) ? object.shapeType : 'rect';
      const x = Number(object.x) || 0;
      const y = Number(object.y) || 0;
      const width = Math.max(1, Number(object.width) || 1);
      const height = Math.max(1, Number(object.height) || 1);
      const rotation = Number(object.rotation) || 0;
      const fill = Array.isArray(object.fill) ? normalizeTextColor(object.fill) : null;
      const stroke = normalizeTextColor(object.stroke);
      const strokeWidth = Math.max(0, Number(object.strokeWidth) || 0);
      const cx = x + width / 2;
      const cy = y + height / 2;

      if (shapeType === 'ellipse') {
        const options = {
          x: cx,
          y: cy,
          xScale: Math.max(0.5, width / 2),
          yScale: Math.max(0.5, height / 2),
          borderWidth: strokeWidth,
          borderColor: stroke,
          rotate: degrees(rotation)
        };
        if (fill) options.color = fill;
        copiedPage.drawEllipse(options);
      } else if (shapeType === 'line') {
        const start = rotatePointAround(x, y, cx, cy, rotation);
        const end = rotatePointAround(x + width, y + height, cx, cy, rotation);
        copiedPage.drawLine({
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
          thickness: Math.max(0.1, strokeWidth),
          color: stroke
        });
      } else {
        const corner = rotatePointAround(x, y, cx, cy, rotation);
        const options = {
          x: corner.x,
          y: corner.y,
          width,
          height,
          borderWidth: strokeWidth,
          borderColor: stroke,
          rotate: degrees(rotation)
        };
        if (fill) options.color = fill;
        copiedPage.drawRectangle(options);
      }
    }

    copiedPage.setRotation(degrees(
      copiedPage.getRotation().angle + normalizePageRotation(pageRef.rotation)
    ));
    output.addPage(copiedPage);
    onProgress?.({ done: index + 1, total: pages.length });
  }

  return output.save({ useObjectStreams });
}

/**
 * Encrypt already-assembled PDF bytes with a user password.
 *
 * @param {object} params
 * @param {Uint8Array} params.bytes
 * @param {string} params.password
 * @param {object} [params.permissions]
 */
export async function protectPdf({ bytes, password, permissions = {} }) {
  return encryptPdfBytes({
    fileData: bytes,
    password,
    permissions: normalizePdfEncryptPermissions(permissions),
    onProgress: () => {}
  });
}

/**
 * Produce a single-page PDF for each page in the ordered page list.
 *
 * @param {object} params
 * @param {Array<{ name: string, bytes: Uint8Array }>} params.sources
 * @param {Array<{ sourceIndex: number, pageIndex: number, rotation: number }>} params.pages
 * @param {(info: { done: number, total: number, bytes: Uint8Array, pageNumber: number }) => void} [params.onPage]
 * @returns {Promise<Array<Uint8Array>>}
 */
export async function splitPdfPages({ sources, pages, onPage }) {
  if (!Array.isArray(sources) || !Array.isArray(pages) || pages.length === 0) {
    throw new Error('No PDF pages are available to split');
  }

  const outputs = [];
  for (let index = 0; index < pages.length; index++) {
    const pageRef = pages[index];
    const bytes = await assemblePdf({
      sources,
      pages: [pageRef],
      useObjectStreams: true,
      onProgress: () => {}
    });
    outputs.push(bytes);
    onPage?.({ done: index + 1, total: pages.length, bytes, pageNumber: index + 1 });
  }
  return outputs;
}
