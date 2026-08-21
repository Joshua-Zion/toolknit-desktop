export const PDF_ENCRYPT_LIMITS = Object.freeze({
  maxInputBytes: 150 * 1024 * 1024,
  maxPages: 200,
  minPasswordLength: 8,
  maxPasswordBytes: 127,
  legacyMaxPasswordLength: 32
});

export const PDF_ENCRYPT_ERROR_PREFIX = 'pdf-encrypt:';

export function assertPdfEncryptSelection(files, totalBytes, limits = PDF_ENCRYPT_LIMITS) {
  if (!Array.isArray(files) || files.length !== 1) {
    throw new Error('Exactly one PDF file is required');
  }
  assertPdfEncryptInput({ length: totalBytes }, limits);
}

export function assertPdfEncryptInput(fileData, limits = PDF_ENCRYPT_LIMITS) {
  if (!fileData?.length || !Number.isSafeInteger(fileData.length)) {
    throw new Error('Invalid PDF file data');
  }
  if (fileData.length > limits.maxInputBytes) {
    throw new Error(`PDF input exceeds the ${Math.floor(limits.maxInputBytes / 1024 / 1024)}MB encryption limit`);
  }
}

export function assertPdfEncryptPageCount(pageCount, limits = PDF_ENCRYPT_LIMITS) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new Error('PDF has no pages to encrypt');
  }
  if (pageCount > limits.maxPages) {
    throw new Error(`PDF input exceeds the ${limits.maxPages}-page encryption limit`);
  }
}

export function assertPdfEncryptPassword(password, limits = PDF_ENCRYPT_LIMITS) {
  if (typeof password !== 'string') {
    throw new Error(`${PDF_ENCRYPT_ERROR_PREFIX}invalid-password`);
  }
  if (Array.from(password).length < limits.minPasswordLength) {
    throw new Error(`${PDF_ENCRYPT_ERROR_PREFIX}password-too-short`);
  }
  if (/[\0\r\n]/.test(password)) {
    throw new Error(`${PDF_ENCRYPT_ERROR_PREFIX}password-unsupported`);
  }
  if (new TextEncoder().encode(password).length > limits.maxPasswordBytes) {
    throw new Error(`${PDF_ENCRYPT_ERROR_PREFIX}password-too-long`);
  }
}

export function assertPdfEncryptLegacyPassword(password, limits = PDF_ENCRYPT_LIMITS) {
  assertPdfEncryptPassword(password, limits);
  if (password.length > limits.legacyMaxPasswordLength) {
    throw new Error(`${PDF_ENCRYPT_ERROR_PREFIX}legacy-password-too-long`);
  }
  for (let index = 0; index < password.length; index++) {
    if (password.charCodeAt(index) > 0xFF) {
      throw new Error(`${PDF_ENCRYPT_ERROR_PREFIX}legacy-password-unsupported`);
    }
  }
}

export function getPdfEncryptErrorCode(error) {
  const message = String(error?.message || error || '');
  const match = message.match(/pdf-encrypt:([a-z-]+)/i);
  return match ? match[1].toLowerCase() : 'encryption-failed';
}

export function normalizePdfEncryptPermissions(permissions = {}) {
  const printing = permissions.printing === 'lowResolution' || permissions.printing === 'highResolution'
    ? permissions.printing
    : permissions.printing === false
      ? false
      : 'highResolution';
  return {
    printing,
    modifying: permissions.modifying !== false,
    copying: permissions.copying !== false,
    annotating: permissions.annotating !== false,
    fillingForms: permissions.fillingForms !== false,
    contentAccessibility: permissions.contentAccessibility !== false,
    documentAssembly: permissions.documentAssembly !== false
  };
}

export function createPdfEncryptFileName(sourceName) {
  const baseName = String(sourceName || 'document.pdf')
    .split(/[\\/]/)
    .pop()
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim() || 'document';
  return `${baseName}_encrypted.pdf`;
}

function createOwnerPassword() {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Secure random source is unavailable');
  }
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function loadPdfDocument() {
  const pdfLib = await import('pdf-lib-plus-encrypt');
  const pdfLibModule = pdfLib.PDFDocument ? pdfLib : pdfLib.default;
  if (!pdfLibModule?.PDFDocument) {
    throw new Error('PDF encryption engine is unavailable');
  }
  return pdfLibModule.PDFDocument;
}

export async function encryptPdf({ fileData, password, permissions, onProgress }) {
  assertPdfEncryptInput(fileData);
  assertPdfEncryptLegacyPassword(password);
  await onProgress?.({ stage: 'loading', percent: 20 });

  // Existing protected files must be explicitly unlocked by PDF Decrypt first.
  const PDFDocument = await loadPdfDocument();
  const pdfDocument = await PDFDocument.load(fileData.slice());
  assertPdfEncryptPageCount(pdfDocument.getPageCount());
  await onProgress?.({ stage: 'encrypting', percent: 60 });

  await pdfDocument.encrypt({
    userPassword: password,
    ownerPassword: createOwnerPassword(),
    permissions: normalizePdfEncryptPermissions(permissions)
  });
  const bytes = await pdfDocument.save({ useObjectStreams: false });
  await onProgress?.({ stage: 'saving', percent: 90 });
  return bytes;
}
