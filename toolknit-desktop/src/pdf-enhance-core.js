export const PDF_ENHANCE_LIMITS = Object.freeze({
  maxInputBytes: 50 * 1024 * 1024,
  maxPages: 100,
  maxRenderPixelsPerPage: 8_000_000,
  maxTotalRenderPixels: 240_000_000,
  maxRenderDimension: 8_192,
  maxOutputBytes: 100 * 1024 * 1024
});

export const PDF_ENHANCE_STRENGTHS = new Set(['light', 'medium', 'strong']);

function enhanceError(code) {
  return new Error(`pdf-enhance:${code}`);
}

export function assertPdfEnhanceSelection(files, limits = PDF_ENHANCE_LIMITS) {
  if (!Array.isArray(files) || files.length !== 1) {
    throw enhanceError('single-file-required');
  }

  const file = files[0];
  if (!/\.pdf$/i.test(String(file?.name || ''))) {
    throw enhanceError('invalid-pdf');
  }

  const size = Number(file?.size);
  if (!Number.isSafeInteger(size) || size < 1) {
    throw enhanceError('invalid-pdf');
  }
  if (size > limits.maxInputBytes) {
    throw enhanceError('input-too-large');
  }
}

export function assertPdfEnhanceStrength(strength) {
  if (!PDF_ENHANCE_STRENGTHS.has(strength)) {
    throw enhanceError('invalid-strength');
  }
}

export function createPdfEnhanceFileName(fileName) {
  const leaf = String(fileName || '').split(/[\\/]/).pop() || '';
  const sourceStem = leaf.replace(/\.pdf$/i, '');
  const sanitizedStem = sourceStem
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
    .replace(/[. ]+$/g, '');
  let boundedStem = '';
  for (const character of sanitizedStem) {
    if (boundedStem.length + character.length > 200) break;
    boundedStem += character;
  }
  boundedStem = boundedStem.replace(/[. ]+$/g, '');
  return `${boundedStem || 'document'}_enhanced.pdf`;
}

export function createPdfEnhanceRenderPlan(pageSizes, options = {}, limits = PDF_ENHANCE_LIMITS) {
  if (!Array.isArray(pageSizes) || pageSizes.length < 1) {
    throw enhanceError('invalid-pdf');
  }
  if (pageSizes.length > limits.maxPages) {
    throw enhanceError('too-many-pages');
  }

  const baseRenderScale = Number(options?.baseRenderScale ?? 2.5);
  if (!Number.isFinite(baseRenderScale) || baseRenderScale <= 0) {
    throw enhanceError('invalid-pdf');
  }

  let totalPageArea = 0;
  let maxSourceDimension = 0;
  let renderScale = baseRenderScale;
  const pages = pageSizes.map((page) => {
    const outputWidth = Number(page?.outputWidth);
    const outputHeight = Number(page?.outputHeight);
    if (!Number.isFinite(outputWidth) || !Number.isFinite(outputHeight)
      || outputWidth <= 0 || outputHeight <= 0) {
      throw enhanceError('invalid-pdf');
    }

    const pageArea = outputWidth * outputHeight;
    if (!Number.isFinite(pageArea) || pageArea <= 0) {
      throw enhanceError('invalid-pdf');
    }

    totalPageArea += pageArea;
    maxSourceDimension = Math.max(maxSourceDimension, outputWidth, outputHeight);
    renderScale = Math.min(
      renderScale,
      limits.maxRenderDimension / outputWidth,
      limits.maxRenderDimension / outputHeight,
      Math.sqrt(limits.maxRenderPixelsPerPage / pageArea)
    );
    return { ...page, outputWidth, outputHeight };
  });

  if (!Number.isFinite(totalPageArea) || totalPageArea <= 0) {
    throw enhanceError('invalid-pdf');
  }
  renderScale = Math.min(renderScale, Math.sqrt(limits.maxTotalRenderPixels / totalPageArea));
  if (!Number.isFinite(renderScale) || renderScale <= 0) {
    throw enhanceError('page-too-large');
  }

  const fitsLimits = (scale) => {
    let totalPixels = 0;
    for (const page of pages) {
      const width = Math.ceil(page.outputWidth * scale);
      const height = Math.ceil(page.outputHeight * scale);
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
        || width > limits.maxRenderDimension || height > limits.maxRenderDimension) {
        return false;
      }
      const pixels = width * height;
      if (!Number.isSafeInteger(pixels) || pixels > limits.maxRenderPixelsPerPage) {
        return false;
      }
      totalPixels += pixels;
      if (!Number.isSafeInteger(totalPixels) || totalPixels > limits.maxTotalRenderPixels) {
        return false;
      }
    }
    return true;
  };

  if (!fitsLimits(renderScale)) {
    let lowerScale = Math.min(renderScale, 1 / maxSourceDimension);
    if (!fitsLimits(lowerScale)) {
      throw enhanceError('page-too-large');
    }
    let upperScale = renderScale;
    for (let iteration = 0; iteration < 64; iteration++) {
      const candidateScale = lowerScale + (upperScale - lowerScale) / 2;
      if (fitsLimits(candidateScale)) {
        lowerScale = candidateScale;
      } else {
        upperScale = candidateScale;
      }
    }
    renderScale = lowerScale;
  }

  return pages.map(page => ({
    ...page,
    renderScale,
    renderWidth: page.outputWidth * renderScale,
    renderHeight: page.outputHeight * renderScale
  }));
}

export function assertPdfEnhancePagePlan(pages, limits = PDF_ENHANCE_LIMITS) {
  if (!Array.isArray(pages) || pages.length < 1) {
    throw enhanceError('invalid-pdf');
  }
  if (pages.length > limits.maxPages) {
    throw enhanceError('too-many-pages');
  }

  let totalPixels = 0;
  let softBudgetExceeded = false;
  for (const page of pages) {
    const outputWidth = Number(page?.outputWidth);
    const outputHeight = Number(page?.outputHeight);
    const width = Math.ceil(Number(page?.renderWidth));
    const height = Math.ceil(Number(page?.renderHeight));
    if (!Number.isFinite(outputWidth) || !Number.isFinite(outputHeight) || outputWidth <= 0 || outputHeight <= 0
      || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
      throw enhanceError('invalid-pdf');
    }
    if (width > limits.maxRenderDimension || height > limits.maxRenderDimension) {
      throw enhanceError('page-too-large');
    }

    const pixels = width * height;
    if (!Number.isSafeInteger(pixels) || pixels > limits.maxRenderPixelsPerPage) {
      throw enhanceError('page-too-large');
    }
    totalPixels += pixels;
    if (!Number.isSafeInteger(totalPixels) || totalPixels > limits.maxTotalRenderPixels) {
      softBudgetExceeded = true;
    }
  }

  return { totalPixels, softBudgetExceeded };
}

export function getPdfEnhanceErrorCode(error) {
  const explicitCode = String(error?.message || error || '').match(/pdf-enhance:([a-z-]+)/i);
  if (explicitCode) return explicitCode[1].toLowerCase();

  const details = String(error?.message || error || '').toLowerCase();
  if (details.includes('password')) return 'password-protected';
  if (details.includes('invalid pdf') || details.includes('pdf header') || details.includes('malformed')) return 'invalid-pdf';
  return 'enhancement-failed';
}
