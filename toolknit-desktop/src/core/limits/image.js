import { MEBIBYTE } from './bytes.js';

export const IMAGE_BATCH_LIMITS = Object.freeze({
  maxFiles: 100,
  maxBytesPerFile: 100 * MEBIBYTE,
  maxPixelsPerFile: 160_000_000
});

export const COLOR_EXTRACTOR_LIMITS = Object.freeze({
  maxBytes: 100 * MEBIBYTE,
  maxPixels: 160_000_000
});

export const IMAGE_STITCH_LIMITS = Object.freeze({
  minFiles: 2,
  maxFiles: 100,
  maxBytesPerFile: 100 * MEBIBYTE,
  maxSpacingPx: 500,
  minScalePercent: 10,
  maxScalePercent: 100,
  maxSide: 65_535,
  maxPixels: 160_000_000
});
