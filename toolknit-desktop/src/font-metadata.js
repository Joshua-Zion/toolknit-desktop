import fontkitModule from '@pdf-lib/fontkit';

// Keep the metadata contract small and serialisable so callers can safely
// persist it alongside a custom font asset. A fresh object is returned for
// every parse, preventing callers from mutating the shared fallback value.
const fontkit = fontkitModule?.default ?? fontkitModule;

function emptyFontMetadata() {
  return {
    familyName: '',
    fullName: '',
    displayName: ''
  };
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').trim();
}

/**
 * Read the human-readable names embedded in a TTF/OTF/WOFF font.
 *
 * Font parsing is deliberately best-effort: a bad or unsupported font must
 * never prevent the settings screen from rendering or importing the asset.
 * The returned object always has the same shape and contains empty strings
 * when metadata cannot be read.
 *
 * @param {ArrayBuffer|ArrayBufferView|Uint8Array} bytes
 * @returns {Promise<{familyName: string, fullName: string, displayName: string}>}
 */
export async function parseFontMetadata(bytes) {
  const buffer = toUint8Array(bytes);
  if (!buffer || buffer.byteLength === 0 || !fontkit || typeof fontkit.create !== 'function') {
    return emptyFontMetadata();
  }

  try {
    const font = fontkit.create(buffer);
    const familyName = cleanName(font?.familyName);
    const fullName = cleanName(font?.fullName);
    const subfamilyName = cleanName(font?.subfamilyName);
    const displayName = fullName || [familyName, subfamilyName].filter(Boolean).join(' ');
    return { familyName, fullName, displayName };
  } catch {
    return emptyFontMetadata();
  }
}

export default parseFontMetadata;
