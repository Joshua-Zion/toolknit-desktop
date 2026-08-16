import JSZip from 'jszip';

const MEBIBYTE = 1024 * 1024;

export const PPT_RENDER_LIMITS = Object.freeze({
  maxInputBytes: 200 * MEBIBYTE,
  maxSlides: 500
});

export const PPT_TO_IMAGE_FORMATS = Object.freeze(['png', 'jpg', 'webp']);
export const PPT_TO_IMAGE_CLARITIES = Object.freeze(['standard', 'high', 'print']);
export const PPT_TO_IMAGE_MODES = Object.freeze(['images']);

export class PptRenderError extends Error {
  constructor(code, message) {
    super(`ppt-render:${code}:${message}`);
    this.name = 'PptRenderError';
    this.code = code;
    this.userMessage = message;
  }
}

function fail(code, message) {
  throw new PptRenderError(code, message);
}

function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  fail('invalid_request', 'PPTX bytes must be a Uint8Array or ArrayBuffer.');
}

function normalizeSourceName(sourceName) {
  return String(sourceName || 'presentation.pptx').split(/[\\/]/).pop() || 'presentation.pptx';
}

function normalizeZipPath(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '');
  const clean = normalized.split('/').filter(Boolean).join('/');
  if (!clean || clean.includes('\0')) return null;
  const posix = clean.replaceAll(/\/+/g, '/');
  if (posix.split('/').includes('..')) return null;
  return posix;
}

function isPptContentTypeValid(contentTypesXml) {
  return /presentationml\.presentation\.main\+xml/i.test(contentTypesXml)
    || /PartName=(["'])\/ppt\/presentation\.xml\1/i.test(contentTypesXml);
}

function findSlideCount(zip) {
  return Object.keys(zip.files)
    .map(normalizeZipPath)
    .filter(Boolean)
    .filter(partPath => /^ppt\/slides\/slide\d+\.xml$/i.test(partPath))
    .length;
}

export function sanitizePptRenderBaseName(value) {
  const pathBaseName = normalizeSourceName(value);
  const base = pathBaseName
    .replace(/\.[A-Za-z0-9]+$/, '')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 80);
  if (!base || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) return 'presentation';
  return base;
}

export function normalizePptToImageFormat(value = 'png') {
  const normalized = String(value || 'png').trim().toLowerCase();
  const format = normalized === 'jpeg' ? 'jpg' : normalized;
  if (!PPT_TO_IMAGE_FORMATS.includes(format)) {
    fail('invalid_format', 'format must be png, jpg, or webp.');
  }
  return format;
}

export function normalizePptToImageClarity(value = 'high') {
  const clarity = String(value || 'high').trim().toLowerCase();
  if (!PPT_TO_IMAGE_CLARITIES.includes(clarity)) {
    fail('invalid_clarity', 'clarity must be standard, high, or print.');
  }
  return clarity;
}

export function normalizePptToImagePages(pages, slideCount) {
  const count = Number(slideCount);
  if (!Number.isSafeInteger(count) || count < 1) fail('empty_ppt', 'PPTX has no slides.');
  if (count > PPT_RENDER_LIMITS.maxSlides) {
    fail('too_many_slides', `PPTX contains more than ${PPT_RENDER_LIMITS.maxSlides} slides.`);
  }
  const values = pages === undefined || pages === null
    ? Array.from({ length: count }, (_, index) => index + 1)
    : pages;
  if (!Array.isArray(values) || values.length < 1) fail('invalid_pages', 'Select at least one slide.');
  const seen = new Set();
  return values.map((page, index) => {
    const number = Number(page);
    if (!Number.isSafeInteger(number) || number < 1 || number > count) {
      fail('invalid_pages', `pages[${index}] is outside the slide range.`);
    }
    if (seen.has(number)) fail('invalid_pages', `Slide ${number} is selected more than once.`);
    seen.add(number);
    return number;
  }).sort((left, right) => left - right);
}

export async function inspectPptxRenderBytes(bytes, options = {}) {
  const sourceName = normalizeSourceName(options.sourceName);
  const data = toUint8Array(bytes);
  if (!/\.pptx$/i.test(sourceName)) {
    fail('invalid_extension', 'Only .pptx files are supported in this stage.');
  }
  if (data.byteLength < 4 || data[0] !== 0x50 || data[1] !== 0x4B) {
    fail('invalid_pptx', 'PPTX must be a valid ZIP-based PowerPoint file.');
  }
  if (data.byteLength > PPT_RENDER_LIMITS.maxInputBytes) {
    fail('input_too_large', `PPTX input exceeds the ${PPT_RENDER_LIMITS.maxInputBytes / MEBIBYTE} MB limit.`);
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    fail('invalid_pptx', 'PPTX could not be opened as a ZIP package.');
  }
  const contentTypes = await zip.file('[Content_Types].xml')?.async('string');
  const presentation = zip.file('ppt/presentation.xml');
  if (!contentTypes || !presentation || !isPptContentTypeValid(contentTypes)) {
    fail('invalid_pptx', 'PPTX does not look like a PowerPoint presentation package.');
  }
  const slideCount = findSlideCount(zip);
  if (slideCount < 1) fail('empty_ppt', 'PPTX has no slides.');
  if (slideCount > PPT_RENDER_LIMITS.maxSlides) {
    fail('too_many_slides', `PPTX contains more than ${PPT_RENDER_LIMITS.maxSlides} slides.`);
  }
  return {
    source_name: sourceName,
    base_name: sanitizePptRenderBaseName(sourceName),
    input_bytes: data.byteLength,
    slide_count: slideCount,
    package_parts: Object.keys(zip.files).length
  };
}

export function createPptToPdfFileName(sourceName) {
  return `${sanitizePptRenderBaseName(sourceName)}.pdf`;
}

export function createPptToPdfManifest(result) {
  return {
    tool: 'ppt.to-pdf',
    source_name: result.source_name,
    input: result.input,
    renderer: result.renderer,
    slide_count: result.slide_count,
    page_count: result.page_count,
    page_count_matches_slides: result.page_count === result.slide_count,
    output_dir: result.output_dir,
    output_path: result.output_path,
    output_file: result.output_file,
    output_bytes: result.output_bytes,
    dry_run: result.dry_run === true,
    warnings: Array.isArray(result.warnings) ? result.warnings : []
  };
}

export function createPptToImageManifest(result) {
  return {
    tool: 'ppt.to-image',
    source_name: result.source_name,
    input: result.input,
    renderer: result.renderer,
    slide_count: result.slide_count,
    page_count: result.page_count,
    selected_pages: result.selected_pages,
    format: result.format,
    clarity: result.clarity,
    output_dir: result.output_dir,
    output_count: result.output_count,
    outputs: result.outputs || [],
    intermediate_pdf_file: result.intermediate_pdf_file || null,
    dry_run: result.dry_run === true,
    warnings: Array.isArray(result.warnings) ? result.warnings : []
  };
}
