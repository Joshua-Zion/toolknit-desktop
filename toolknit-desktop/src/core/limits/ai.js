import { MEBIBYTE } from './bytes.js';

export const PDF_AI_MARKDOWN_LIMITS = Object.freeze({
  maxDocumentBytes: 150 * MEBIBYTE,
  maxPages: 120,
  maxImageBytes: 7 * MEBIBYTE,
  maxTextPerPage: 50_000,
  maxSummaryChars: 28_000
});
