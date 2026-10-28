/**
 * Utility functions for Indonesian phone / WhatsApp number formatting.
 * Ensures numbers always have the leading "0" (e.g., "081234567890"),
 * automatically handles prefixes like "62", "+62", or omitted leading zeroes (e.g., "812...").
 */

/**
 * Normalizes any phone number string or number to always begin with "0".
 * Examples:
 * - "8123456789" -> "08123456789"
 * - "+628123456789" -> "08123456789"
 * - "628123456789" -> "08123456789"
 * - "0812-3456-789" -> "08123456789"
 * - "" -> ""
 */
export function normalizePhoneWithZero(input: string | number | undefined | null): string {
  if (input === undefined || input === null) return '';
  const raw = String(input).trim();
  if (!raw) return '';

  // Extract digits
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  // Case: Starts with country code 62 (e.g. 62812... or 62...)
  if (digits.startsWith('62')) {
    digits = '0' + digits.slice(2);
  }
  // Case: Starts with 8 (e.g. 812345678...)
  else if (digits.startsWith('8')) {
    digits = '0' + digits;
  }
  // Case: Starts with any non-zero, prepend 0 so it ALWAYS begins with '0'
  else if (!digits.startsWith('0')) {
    digits = '0' + digits;
  }

  // Remove multiple leading zeros (e.g. 00812 -> 0812), but keep single '0'
  if (digits.startsWith('00')) {
    digits = '0' + digits.replace(/^0+/, '');
  }

  return digits;
}

/**
 * Formatter for live input typing (onChange handlers).
 * Handles user typing '8' to automatically become '08',
 * prevents non-numeric input, and strips +62 / 62 to 0.
 */
export function formatPhoneInput(rawInput: string): string {
  if (!rawInput) return '';

  const trimmed = rawInput.trim();

  // If user pasted or typed with leading +, e.g. +628...
  if (trimmed.startsWith('+62')) {
    return '0' + trimmed.slice(3).replace(/\D/g, '');
  }
  if (trimmed.startsWith('62') && trimmed.length >= 3) {
    return '0' + trimmed.slice(2).replace(/\D/g, '');
  }

  // Remove any non-digits
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  // If first digit typed is '8', immediately prepend '0' -> '08'
  if (digits.startsWith('8')) {
    return '0' + digits;
  }

  // If starts with '0', keep as is
  if (digits.startsWith('0')) {
    return digits;
  }

  // If non-zero and user started typing (e.g., single digit other than 0 or 8), prepend 0
  return '0' + digits;
}

/**
 * Formats a phone number for neat human-readable display with dashes if long enough,
 * always starting with 0. Example: "0812-3456-7890"
 */
export function formatPhoneDisplay(phone: string | number | undefined | null): string {
  const norm = normalizePhoneWithZero(phone);
  if (!norm) return '-';
  if (norm.length >= 10) {
    return `${norm.slice(0, 4)}-${norm.slice(4, 8)}-${norm.slice(8)}`;
  }
  return norm;
}

/**
 * Converts a phone number to WhatsApp's required international format
 * (no leading "0", prefixed with country code "62") for use in wa.me links.
 * Examples:
 * - "081234567890" -> "6281234567890"
 * - "81234567890" -> "6281234567890"
 * - "" -> ""
 */
export function toWhatsappNumber(phone: string | number | undefined | null): string {
  const norm = normalizePhoneWithZero(phone);
  if (!norm) return '';
  return norm.startsWith('0') ? '62' + norm.slice(1) : norm;
}
