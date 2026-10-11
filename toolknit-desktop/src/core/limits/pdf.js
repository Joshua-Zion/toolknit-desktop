import { MEBIBYTE } from './bytes.js';

export const PDF_EDITOR_LIMITS = Object.freeze({
  maxInputBytes: 150 * MEBIBYTE,
  maxPages: 500,
  maxMergeFiles: 25,
  maxMergeTotalBytes: 150 * MEBIBYTE
});

export const PDF_TO_IMAGE_LIMITS = Object.freeze({
  maxFiles: 1,
  maxInputBytes: 150 * MEBIBYTE,
  maxPages: 200,
  maxLongPages: 20,
  maxPagesPerLongImage: 5,
  minGridPages: 4,
  maxGridPages: 9,
  gridGap: 24,
  maxRenderSide: 16_384,
  maxRenderPixels: 40_000_000,
  maxLongImageSide: 32_767,
  maxLongImagePixels: 60_000_000,
  maxEstimatedWorkingBytes: 384 * MEBIBYTE
});

export const PDF_ENHANCE_LIMITS = Object.freeze({
  maxInputBytes: 50 * MEBIBYTE,
  maxPages: 100,
  maxRenderPixelsPerPage: 8_000_000,
  maxTotalRenderPixels: 240_000_000,
  maxRenderDimension: 8_192,
  maxOutputBytes: 100 * MEBIBYTE
});

export const PDF_TEXT_LIMITS = Object.freeze({
  maxDocumentBytes: 150 * MEBIBYTE,
  maxPages: 300,
  maxItemsPerPage: 100_000,
  maxCharacters: 2_000_000
});

export const PDF_SCAN_LIMITS = Object.freeze({
  inputBytes: 64 * MEBIBYTE,
  outputBytes: 100 * MEBIBYTE,
  pages: 100,
  pixels: 16_000_000,
  side: 8_192,
  timeoutMs: 10 * 60 * 1000
});
