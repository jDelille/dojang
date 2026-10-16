import crypto from 'node:crypto';

/**
 * AES-256-GCM credential vault (spec §9 Security).
 *
 * Every third-party secret a workspace supplies — AI provider keys, Twilio
 * tokens, Stripe secrets, OAuth refresh tokens — is stored as an envelope:
 *
 *   v1.<iv base64>.<authTag base64>.<ciphertext base64>
 *
 * Plaintext never touches the database. Rotating ENCRYPTION_KEY invalidates
 * every stored credential, so the installer sets it once and warns about it.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const VERSION = 'v1';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.',
    );
  }

  // Accept base64 (preferred), hex, or a raw passphrase we stretch with SHA-256.
  let key: Buffer;
  if (/^[A-Za-z0-9+/]{43}=$/.test(raw)) {
    key = Buffer.from(raw, 'base64');
  } else if (/^[0-9a-f]{64}$/i.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = crypto.createHash('sha256').update(raw).digest();
  }

  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must resolve to 32 bytes (base64 of 32 random bytes).');
  }

  cachedKey = key;
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

export function decrypt(envelope: string): string {
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed credential envelope.');
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Encrypt a credential bag (`{ apiKey, accountSid, ... }`). */
export function encryptJson(value: Record<string, unknown>): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T = Record<string, string>>(envelope: string): T {
  return JSON.parse(decrypt(envelope)) as T;
}

/**
 * Safe-to-display form of a secret: `sk-ant-…9f2a`.
 * Used everywhere the UI echoes a stored key back to the buyer.
 */
export function maskSecret(secret: string | null | undefined): string {
  if (!secret) return '';
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

/** Constant-time compare for webhook signatures and purchase codes. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}
