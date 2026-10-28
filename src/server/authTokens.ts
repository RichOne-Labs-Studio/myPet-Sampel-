/**
 * Server-Side Authentication & Session Token Management
 * 
 * STRICTLY SERVER-SIDE: Never bundled in client/browser code.
 * Uses cryptographically secure Node.js native crypto routines:
 * - HMAC-SHA256 session token generation and timing-safe verification
 * - Dynamic / Environment-based server session secret (never exposed to client bundle)
 * - Salted cryptographic password hashing
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const SECRET_FILE = path.join(DATA_DIR, '.session_secret');

/**
 * Retrieves or generates a server-side only secret key for signing session tokens.
 * Priority:
 * 1. process.env.SESSION_SECRET
 * 2. Persistent secret in data/.session_secret
 * 3. Ephemeral cryptographically random secret
 */
function getServerSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 32) {
    return process.env.SESSION_SECRET.trim();
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SECRET_FILE)) {
      const stored = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (stored && stored.length >= 32) {
        return stored;
      }
    }

    // Generate a fresh cryptographically secure 256-bit random hex secret
    const newSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, newSecret, { mode: 0o600 });
    return newSecret;
  } catch (err) {
    console.warn('[Auth] Could not persist session secret, using memory-only secret:', err);
    return crypto.randomBytes(32).toString('hex');
  }
}

const SERVER_SESSION_SECRET = getServerSessionSecret();

export interface SessionPayload {
  uid: string;
  usr: string;
  rol: string;
  iat: number;
  exp: number;
}

export interface SessionVerificationResult {
  valid: boolean;
  userId?: string;
  username?: string;
  role?: string;
}

/**
 * Generates an HMAC-SHA256 signed session token (24-hour expiration).
 */
export function generateSessionToken(userId: string, username: string, role: string): string {
  const iat = Date.now();
  const exp = iat + 24 * 60 * 60 * 1000; // 24 hours

  const payload: SessionPayload = {
    uid: userId,
    usr: username,
    rol: role,
    iat,
    exp,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');

  const hmac = crypto.createHmac('sha256', SERVER_SESSION_SECRET);
  hmac.update(payloadB64);
  const signature = hmac.digest('base64url');

  return `v2.${payloadB64}.${signature}`;
}

/**
 * Timing-safe verification of HMAC-signed session tokens.
 */
export function verifySessionToken(token: string): SessionVerificationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'v2') {
    return { valid: false };
  }

  const [, payloadB64, providedSig] = parts;

  try {
    const hmac = crypto.createHmac('sha256', SERVER_SESSION_SECRET);
    hmac.update(payloadB64);
    const expectedSig = hmac.digest('base64url');

    const expectedBuf = Buffer.from(expectedSig);
    const providedBuf = Buffer.from(providedSig);

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return { valid: false }; // Tampered signature
    }

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const data = JSON.parse(payloadJson) as SessionPayload;

    if (!data.uid || !data.usr || !data.exp || !data.rol) {
      return { valid: false };
    }

    if (Date.now() > data.exp) {
      return { valid: false }; // Expired
    }

    return {
      valid: true,
      userId: data.uid,
      username: data.usr,
      role: data.rol,
    };
  } catch {
    return { valid: false };
  }
}

const CLINIC_CIPHER_KEY = 'VierPetCare-SecurityCipher-2026-MedicalEncryption-v2';

/**
 * Modern Cryptographic Password Hashing:
 * Format: SHA256:v2:<hexSalt>:<hexHash>
 */
export function hashPassword(plainPassword: string, customSalt?: string): string {
  if (!plainPassword || typeof plainPassword !== 'string') return '';
  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const payload = `${salt}:${plainPassword.trim()}:${CLINIC_CIPHER_KEY}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  return `SHA256:v2:${salt}:${hash}`;
}

/**
 * Cryptographically verifies password across modern salted SHA256:v2 and initial plaintext seeds.
 */
export function verifyPassword(plainPassword: string, storedHashOrPlain: string): boolean {
  if (!plainPassword || !storedHashOrPlain) return false;
  const cleanPass = plainPassword.trim();
  const cleanStored = String(storedHashOrPlain).trim();

  // Modern salted hash format
  if (cleanStored.startsWith('SHA256:v2:')) {
    const parts = cleanStored.split(':');
    if (parts.length === 4) {
      const salt = parts[2];
      const expected = parts[3];
      const payload = `${salt}:${cleanPass}:${SERVER_SESSION_SECRET}`;
      const computed = crypto.createHash('sha256').update(payload).digest('hex');
      if (computed === expected) return true;

      // Fallback check jika hash dibuat dengan CLINIC_CIPHER_KEY
      const payloadClinic = `${salt}:${cleanPass}:VierPetCare-SecurityCipher-2026-MedicalEncryption-v2`;
      const computedClinic = crypto.createHash('sha256').update(payloadClinic).digest('hex');
      if (computedClinic === expected) return true;

      return false;
    }
  }

  // Legacy fallback if hash was created with old clinic key
  if (cleanStored.startsWith('SHA256:v1:')) {
    const parts = cleanStored.split(':');
    if (parts.length === 4) {
      const salt = parts[2];
      const expected = parts[3];
      const payload = `${salt}:${cleanPass}:VierPetCare-SecurityCipher-2026-MedicalEncryption-v2`;
      const computed = crypto.createHash('sha256').update(payload).digest('hex');
      return computed === expected;
    }
  }

  // Plaintext match for unmigrated seed accounts
  return cleanPass === cleanStored;
}

/**
 * Checks all staff in database; if any password is plain text, hashes it in-place.
 * Returns true if any updates were made.
 */
export function migrateStaffPasswordsInPlace(staffList: any[]): boolean {
  if (!Array.isArray(staffList)) return false;
  let updated = false;

  for (const staff of staffList) {
    if (staff && staff.password) {
      const passStr = String(staff.password).trim();
      if (!passStr.startsWith('SHA256:v2:')) {
        staff.password = hashPassword(passStr);
        updated = true;
      }
    }
  }

  return updated;
}
