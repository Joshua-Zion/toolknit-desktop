// Shared binary size units for product-level file limits.
export const KIBIBYTE = 1024;
export const MEBIBYTE = KIBIBYTE * KIBIBYTE;
export const GIBIBYTE = MEBIBYTE * KIBIBYTE;

export function mebibytes(value) {
  return value * MEBIBYTE;
}
