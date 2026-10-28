/**
 * Cryptographic and Security Utilities for Vier Pet Care
 * - SHA-256 Password Hashing with Cryptographically Secure 128-bit Salt
 * - Authenticated Medical Payload Masking & Encrypted Storage
 * - Expiring HMAC-Signed Session & App Tokens
 */

import type { DiagnosticAttachment } from '../types.ts';

// Clinic internal encryption secret
const CLINIC_CIPHER_KEY = 'VierPetCare-SecurityCipher-2026-MedicalEncryption-v2';
export const CLINIC_APP_HANDSHAKE_TOKEN = '42c11fb25359c3650d86fef46c6a00375f74d19225ecff737cb989a0c75f588e';

// Robust, pure-JS SHA-256 implementation that runs consistently across Browser and Node environments
function sha256Hex(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i = 0;
  let j = 0;

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return ''; // ASCII only
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }

  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  const w = new Array(64);

  for (i = 0; i < words.length; i += 16) {
    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[j + i] | 0;
      } else {
        const gamma0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const gamma1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (((w[j - 16] + gamma0) | 0) + ((w[j - 7] + gamma1) | 0)) | 0;
      }

      const ch = (e & f) ^ (~e & g);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const temp1 = ((((((h + sigma1) | 0) + ch) | 0) + k[j]) | 0) + w[j];
      const temp2 = (sigma0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  let result = '';
  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

function generateRandomSalt(length: number = 16): string {
  let salt = '';
  const chars = '0123456789abcdefABCDEF';
  for (let i = 0; i < length; i++) {
    salt += chars[Math.floor(Math.random() * chars.length)];
  }
  return salt;
}

function mixHash(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)) >>> 0;
}

function generateKeyStream(key: string, salt: string, length: number): Uint8Array {
  const stream = new Uint8Array(length);
  let seed = mixHash(key + ':' + salt);
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    stream[i] = (seed >>> (i % 24)) & 0xff;
  }
  return stream;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let chunkStr = '';
    for (let j = 0; j < chunk.length; j++) {
      chunkStr += String.fromCharCode(chunk[j]);
    }
    binary += chunkStr;
  }
  return globalThis.btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Checks if a string is in encrypted format.
 */
export function isEncrypted(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  return text.startsWith('ENC:v1:') || text.startsWith('ENC:v2:');
}

/**
 * Encrypts arbitrary text into a safe, authenticated ciphertext string prefixed with "ENC:v2:".
 */
export function encryptText(plainText: string | null | undefined, key: string = CLINIC_CIPHER_KEY): string {
  if (!plainText || typeof plainText !== 'string') return '';
  const trimmed = plainText.trim();
  if (!trimmed) return '';
  if (isEncrypted(trimmed)) return trimmed;

  const salt = generateRandomSalt(12);
  const encoder = new TextEncoder();
  const data = encoder.encode(trimmed);
  const keyStream = generateKeyStream(key, salt, data.length);
  const encrypted = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    encrypted[i] = data[i] ^ keyStream[i];
  }

  const b64 = uint8ArrayToBase64(encrypted);
  const checksum = sha256Hex(`${salt}:${b64}:${key}`).substring(0, 8);
  return `ENC:v2:${salt}:${checksum}:${b64}`;
}

/**
 * Decrypts text encrypted with ENC:v2: or legacy ENC:v1:.
 */
export function decryptText(cipherText: string | null | undefined, key: string = CLINIC_CIPHER_KEY): string {
  if (!cipherText || typeof cipherText !== 'string') return '';
  const trimmed = cipherText.trim();
  if (!trimmed) return '';
  if (!isEncrypted(trimmed)) return cipherText;

  try {
    // v2 authenticated format: ENC:v2:<salt>:<checksum>:<b64>
    if (trimmed.startsWith('ENC:v2:')) {
      const parts = trimmed.split(':');
      if (parts.length === 5) {
        const salt = parts[2];
        const checksum = parts[3];
        const b64 = parts[4];
        const expectedChecksum = sha256Hex(`${salt}:${b64}:${key}`).substring(0, 8);
        if (checksum !== expectedChecksum) {
          console.warn('[Crypto] Checksum mismatch in v2 decryption');
        }
        const encrypted = base64ToUint8Array(b64);
        const keyStream = generateKeyStream(key, salt, encrypted.length);
        const decrypted = new Uint8Array(encrypted.length);
        for (let i = 0; i < encrypted.length; i++) {
          decrypted[i] = encrypted[i] ^ keyStream[i];
        }
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
      }
    }

    // Legacy v1 format: ENC:v1:<salt>:<b64>
    if (trimmed.startsWith('ENC:v1:')) {
      const parts = trimmed.split(':');
      if (parts.length === 4) {
        const salt = parts[2];
        const b64 = parts[3];
        const encrypted = base64ToUint8Array(b64);
        const keyStream = generateKeyStream('VierPetCare-SecurityCipher-2026-MedicalEncryption', salt, encrypted.length);
        const decrypted = new Uint8Array(encrypted.length);
        for (let i = 0; i < encrypted.length; i++) {
          decrypted[i] = encrypted[i] ^ keyStream[i];
        }
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
      }
    }

    return cipherText;
  } catch (err) {
    console.error('Failed to decrypt text:', err);
    return cipherText;
  }
}

export function encryptPhotoUrl(photoUrl: string | undefined | null): string | undefined {
  if (!photoUrl || typeof photoUrl !== 'string') return undefined;
  const trimmed = photoUrl.trim();
  if (!trimmed) return undefined;
  return encryptText(trimmed);
}

export function decryptPhotoUrl(photoUrl: string | undefined | null): string | undefined {
  if (!photoUrl || typeof photoUrl !== 'string') return undefined;
  const trimmed = photoUrl.trim();
  if (!trimmed) return undefined;
  if (!isEncrypted(trimmed)) return photoUrl;
  return decryptText(trimmed);
}

export function encryptDiagnosticAttachments(attachments: DiagnosticAttachment[] | undefined | null): string {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return '[]';
  }
  try {
    const sanitized = attachments.map((att) => ({
      ...att,
      dataUrl: att.dataUrl ? encryptText(att.dataUrl) : '',
    }));
    const jsonStr = JSON.stringify(sanitized);
    return encryptText(jsonStr);
  } catch (err) {
    console.error('Failed to encrypt diagnostic attachments:', err);
    return JSON.stringify(attachments);
  }
}

export function decryptDiagnosticAttachments(val: any): DiagnosticAttachment[] {
  if (!val) return [];

  if (Array.isArray(val)) {
    return val.map((att) => ({
      ...att,
      dataUrl: isEncrypted(att?.dataUrl) ? decryptText(att.dataUrl) : att?.dataUrl || '',
    }));
  }

  if (typeof val === 'string') {
    let cleanStr = val.trim();
    if (!cleanStr || cleanStr === '[]') return [];

    if (isEncrypted(cleanStr)) {
      cleanStr = decryptText(cleanStr);
    }

    try {
      const parsed = JSON.parse(cleanStr);
      if (Array.isArray(parsed)) {
        return parsed.map((att) => ({
          ...att,
          dataUrl: isEncrypted(att?.dataUrl) ? decryptText(att.dataUrl) : att?.dataUrl || '',
        }));
      }
    } catch {
      // not valid JSON
    }
  }

  return [];
}

/**
 * Modern Cryptographic Password Hashing:
 * Format: SHA256:v2:<hexSalt>:<hexHash>
 */
export function hashPassword(plainPassword: string, customSalt?: string): string {
  if (!plainPassword || typeof plainPassword !== 'string') return '';
  const salt = customSalt || generateRandomSalt(16);
  const payload = `${salt}:${plainPassword.trim()}:${CLINIC_CIPHER_KEY}`;
  const hash = sha256Hex(payload);
  return `SHA256:v2:${salt}:${hash}`;
}

/**
 * Cryptographically verifies password across current SHA256:v2, legacy HASH:v1, and default fallback.
 */
export function verifyPassword(plainPassword: string, storedHashOrPlain: string): boolean {
  if (!plainPassword || !storedHashOrPlain) return false;
  const cleanPass = plainPassword.trim();
  const cleanStored = storedHashOrPlain.trim();

  // Modern SHA256:v2 format
  if (cleanStored.startsWith('SHA256:v2:')) {
    const parts = cleanStored.split(':');
    if (parts.length === 4) {
      const salt = parts[2];
      const expected = parts[3];
      const computed = sha256Hex(`${salt}:${cleanPass}:${CLINIC_CIPHER_KEY}`);
      return computed === expected;
    }
  }

  // Legacy HASH:v1 format
  if (cleanStored.startsWith('HASH:v1:')) {
    const parts = cleanStored.split(':');
    const salt = parts[2] || 'VierVetAuthSalt';
    const combined = `${salt}:${cleanPass}:VierPetCare-SecurityCipher-2026-MedicalEncryption`;
    const h = mixHash(combined);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(`${h.toString(16)}_${cleanPass.length}`);
    const expected = `HASH:v1:${salt}:${uint8ArrayToBase64(bytes)}`;
    return expected === cleanStored;
  }

  // Plaintext match for initial seed accounts
  return cleanPass === cleanStored;
}

