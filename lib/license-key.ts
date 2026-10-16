import { ed25519 } from '@noble/curves/ed25519.js';
import { base64urlnopad } from '@scure/base';

/**
 * Signed license keys for direct sales.
 *
 * Envato codes only work for Envato purchases. Selling straight to a customer
 * needs a key you can issue yourself, and that a buyer's self-hosted install
 * can validate **offline** — no phone-home, no license server, nothing to go
 * down on a customer's launch day.
 *
 * Ed25519 gives that: the seller signs a payload with a private key that never
 * leaves their machine, and the product verifies it with the matching public
 * key. Forging a key means breaking the signature, and the public key baked
 * into the product is worthless to an attacker.
 *
 * Deliberately *not* HMAC — a shared secret capable of verifying is also
 * capable of minting, so shipping it would hand every buyer a key generator.
 */

export interface LicensePayload {
  /** Registrable domain this key is valid for. '*' allows any. */
  d: string;
  /** Buyer reference — an email or order id, for support lookups. */
  b?: string;
  /** Issued at (unix seconds). */
  i: number;
  /** Expires at (unix seconds). Omitted means perpetual. */
  e?: number;
  /** Plan or tier label, surfaced in Settings. */
  p?: string;
}

export type KeyVerdict =
  | { valid: true; payload: LicensePayload }
  | { valid: false; reason: string };

const PREFIX = 'ROSTER-';

function canonical(payload: LicensePayload): Uint8Array {
  // Sorted keys so the bytes signed and the bytes verified always match,
  // regardless of how the object was constructed.
  const ordered: Record<string, unknown> = {};
  const source = payload as unknown as Record<string, unknown>;
  for (const k of Object.keys(source).sort()) {
    if (source[k] !== undefined) ordered[k] = source[k];
  }
  return new TextEncoder().encode(JSON.stringify(ordered));
}

/** Seller-side. Never runs in the product — the private key stays with you. */
export function signLicenseKey(payload: LicensePayload, privateKeyHex: string): string {
  const message = canonical(payload);
  const signature = ed25519.sign(message, hexToBytes(privateKeyHex));
  return (
    PREFIX +
    base64urlnopad.encode(message) +
    '.' +
    base64urlnopad.encode(signature)
  );
}

/** Buyer-side. Verifies with the public key shipped in the product. */
export function verifyLicenseKey(
  key: string,
  domain: string,
  publicKeyHex = process.env.LICENSE_PUBLIC_KEY ?? '',
): KeyVerdict {
  if (!publicKeyHex) {
    return { valid: false, reason: 'No LICENSE_PUBLIC_KEY is configured on this install.' };
  }

  const trimmed = key.trim();
  if (!trimmed.startsWith(PREFIX)) {
    return { valid: false, reason: 'That is not a Roster license key.' };
  }

  const [body, sig] = trimmed.slice(PREFIX.length).split('.');
  if (!body || !sig) return { valid: false, reason: 'That license key is malformed.' };

  let message: Uint8Array;
  let signature: Uint8Array;
  try {
    message = base64urlnopad.decode(body);
    signature = base64urlnopad.decode(sig);
  } catch {
    return { valid: false, reason: 'That license key is malformed.' };
  }

  let ok = false;
  try {
    ok = ed25519.verify(signature, message, hexToBytes(publicKeyHex));
  } catch {
    ok = false;
  }
  if (!ok) return { valid: false, reason: 'That license key failed its signature check.' };

  let payload: LicensePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(message)) as LicensePayload;
  } catch {
    return { valid: false, reason: 'That license key is malformed.' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.e && now > payload.e) {
    return { valid: false, reason: 'That license key expired on ' + new Date(payload.e * 1000).toDateString() + '.' };
  }

  // Domain lock. '*' is for site-wide or agency keys.
  if (payload.d && payload.d !== '*' && payload.d !== domain) {
    return {
      valid: false,
      reason: `That license key is registered to ${payload.d}, not ${domain}.`,
    };
  }

  return { valid: true, payload };
}

export function looksLikeLicenseKey(value: string): boolean {
  return value.trim().startsWith(PREFIX);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Generates a fresh signing keypair. Run once, keep the private half safe. */
export function generateKeypair(): { privateKey: string; publicKey: string } {
  const priv = ed25519.utils.randomSecretKey();
  const pub = ed25519.getPublicKey(priv);
  const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return { privateKey: hex(priv), publicKey: hex(pub) };
}
