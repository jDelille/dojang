import { ed25519 } from '@noble/curves/ed25519.js';
import { base64urlnopad } from '@scure/base';
import { prisma } from '@/lib/db';
import type { LicenseStatus } from '@prisma/client';

/**
 * Envato purchase-code verification + domain lock (spec §4.11, §10.3).
 *
 * There are two ways to check a code, and which one runs depends on how the
 * copy was configured:
 *
 *  1. LICENSE_API_URL — a license server the *seller* runs. Preferred, and how
 *     copies sold on Envato are shipped. An Envato purchase code can only be
 *     checked with the author's personal token, and a self-hosted script hands
 *     the buyer its entire source; a token in the ZIP is a token published.
 *     Asking a server the seller controls keeps it out of the product, and it
 *     is the only place a seat count can be enforced, since a buyer can always
 *     reset their own database.
 *
 *  2. ENVATO_PERSONAL_TOKEN — a direct call to Envato with a token on this
 *     install. Only useful to the seller themselves, or to a buyer running
 *     their own fork.
 *
 * Direct-sale keys are signed and verified offline and never reach either path.
 */

const VERIFY_URL = 'https://api.envato.com/v3/market/author/sale';

export type EnvatoSale = {
  buyer: string;
  item: { id: number; name: string };
  license: string;
  sold_at: string;
  supported_until: string | null;
  code: string;
};

export type VerificationResult = {
  status: LicenseStatus;
  message: string;
  sale?: EnvatoSale;
};

const PURCHASE_CODE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWellFormedPurchaseCode(code: string): boolean {
  return PURCHASE_CODE_RE.test(code.trim());
}

/** Normalizes a URL or host into the bare registrable host for domain lock. */
export function normalizeDomain(input: string): string {
  let host = input.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  return host.replace(/^www\./, '');
}

export function currentDomain(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'localhost';
  return normalizeDomain(url);
}

/** Localhost and private ranges are exempt so buyers can develop offline. */
export function isExemptDomain(domain: string): boolean {
  return (
    domain === 'localhost' ||
    domain === '127.0.0.1' ||
    domain.endsWith('.local') ||
    domain.endsWith('.test') ||
    /^192\.168\./.test(domain) ||
    /^10\./.test(domain)
  );
}

/**
 * Asks the seller's license server.
 *
 * Returns null — rather than a verdict — when the server cannot be reached at
 * all, so the caller can fall through to a local token if one exists instead of
 * turning the seller's downtime into a customer's outage.
 */
async function verifyViaLicenseServer(
  baseUrl: string,
  code: string,
  domain: string,
): Promise<VerificationResult | null> {
  const product = process.env.LICENSE_PRODUCT || 'roster';
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/verify`;

  let body: Record<string, unknown>;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product, code, domain }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    // 429 is the server's rate limiter, not a verdict on the license.
    if (response.status === 429) return null;
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }

  const status = body.status as LicenseStatus | undefined;
  if (!status) return null;

  // A signed verdict is what distinguishes the real license server from a
  // hosts-file entry pointing at something that always says yes. Only enforced
  // when a public key was shipped with this copy.
  const publicKey = process.env.LICENSE_PUBLIC_KEY?.trim();
  if (publicKey) {
    if (!verifyVerdictSignature(body, { product, code, domain, publicKey })) {
      return {
        status: 'unverified',
        message: 'The license server\'s reply could not be authenticated. Check LICENSE_API_URL.',
      };
    }
  }

  return {
    status,
    message: String(body.message ?? ''),
    sale:
      status === 'active'
        ? ({
            buyer: String(body.buyer ?? ''),
            item: { id: 0, name: String(body.itemName ?? 'Roster') },
            license: String(body.licenseType ?? ''),
            sold_at: String(body.soldAt ?? ''),
            supported_until: (body.supportedUntil as string | null) ?? null,
            code,
          } satisfies EnvatoSale)
        : undefined,
  };
}

function verifyVerdictSignature(
  body: Record<string, unknown>,
  expected: { product: string; code: string; domain: string; publicKey: string },
): boolean {
  const signature = body.signature;
  if (typeof signature !== 'string' || !signature) return false;

  // The signature covers these five fields, so checking them against what was
  // actually asked is what stops a captured "active" verdict for one domain
  // being replayed on another.
  if (
    body.product !== expected.product ||
    body.code !== expected.code ||
    body.domain !== expected.domain
  ) {
    return false;
  }

  const issuedAt = Number(body.issuedAt);
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() / 1000 - issuedAt) > 600) return false;

  const signed: Record<string, unknown> = {
    code: body.code,
    domain: body.domain,
    issuedAt,
    product: body.product,
    status: body.status,
  };
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(signed).sort()) ordered[key] = signed[key];

  const message = new TextEncoder().encode(
    `${expected.product}:license-response:v1\n${JSON.stringify(ordered)}`,
  );

  try {
    return ed25519.verify(base64urlnopad.decode(signature), message, hexToBytes(expected.publicKey));
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function verifyPurchaseCode(
  purchaseCode: string,
  domain: string,
): Promise<VerificationResult> {
  const code = purchaseCode.trim();

  if (!isWellFormedPurchaseCode(code)) {
    return {
      status: 'invalid',
      message: 'That does not look like an Envato purchase code (8-4-4-4-12 hex format).',
    };
  }

  const licenseServer = process.env.LICENSE_API_URL?.trim();
  if (licenseServer) {
    const result = await verifyViaLicenseServer(licenseServer, code, normalizeDomain(domain));
    if (result) return result;
    // Unreachable. A local token is the only remaining way to check, and most
    // installs will not have one — that lands on 'unverified' below, which the
    // license gate tolerates for a previously-valid copy.
  }

  const token = process.env.ENVATO_PERSONAL_TOKEN;
  if (!token) {
    // Nowhere left to ask. Rather than hard-block a paying buyer, record the
    // code and mark the license unverified.
    return {
      status: 'unverified',
      message: licenseServer
        ? 'The license server could not be reached, so the purchase code has been stored and will be checked again shortly.'
        : 'This install has no license server or Envato token configured, so the purchase code could not be checked online. It has been stored and will be verified once one is set.',
    };
  }

  try {
    const response = await fetch(`${VERIFY_URL}?code=${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (response.status === 404) {
      return { status: 'invalid', message: 'Envato does not recognize this purchase code.' };
    }
    if (response.status === 403 || response.status === 401) {
      return {
        status: 'unverified',
        message: 'The Envato personal token was rejected. Check ENVATO_PERSONAL_TOKEN.',
      };
    }
    if (!response.ok) {
      return {
        status: 'unverified',
        message: `Envato returned HTTP ${response.status}. Try verifying again shortly.`,
      };
    }

    const sale = (await response.json()) as EnvatoSale;

    return {
      status: 'active',
      message: `License verified for ${sale.buyer} on ${normalizeDomain(domain)}.`,
      sale,
    };
  } catch (error) {
    return {
      status: 'unverified',
      message: `Could not reach Envato: ${(error as Error).message}`,
    };
  }
}

/**
 * Verifies and persists. Domain lock: once a license is bound to a host, a
 * different host reports `domain_mismatch` rather than silently re-binding.
 */
export async function verifyAndStoreLicense(
  workspaceId: string,
  purchaseCode: string,
  domain = currentDomain(),
): Promise<VerificationResult> {
  const normalizedDomain = normalizeDomain(domain);
  const existing = await prisma.license.findUnique({ where: { workspaceId } });

  if (
    existing &&
    existing.status === 'active' &&
    existing.domain !== normalizedDomain &&
    !isExemptDomain(normalizedDomain)
  ) {
    const result: VerificationResult = {
      status: 'domain_mismatch',
      message: `This license is locked to ${existing.domain}. Contact the author to move it to ${normalizedDomain}.`,
    };
    await prisma.license.update({
      where: { workspaceId },
      data: { status: result.status, message: result.message, lastCheckedAt: new Date() },
    });
    return result;
  }

  const result = await verifyPurchaseCode(purchaseCode, normalizedDomain);

  await prisma.license.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      envatoPurchaseCode: purchaseCode.trim(),
      domain: normalizedDomain,
      status: result.status,
      message: result.message,
      buyerName: result.sale?.buyer ?? null,
      itemName: result.sale?.item?.name ?? null,
      supportedUntil: result.sale?.supported_until
        ? new Date(result.sale.supported_until)
        : null,
      verifiedAt: result.status === 'active' ? new Date() : null,
      lastCheckedAt: new Date(),
    },
    update: {
      envatoPurchaseCode: purchaseCode.trim(),
      domain: normalizedDomain,
      status: result.status,
      message: result.message,
      buyerName: result.sale?.buyer ?? undefined,
      itemName: result.sale?.item?.name ?? undefined,
      supportedUntil: result.sale?.supported_until
        ? new Date(result.sale.supported_until)
        : undefined,
      verifiedAt: result.status === 'active' ? new Date() : undefined,
      lastCheckedAt: new Date(),
    },
  });

  return result;
}

export async function getLicenseStatus(workspaceId: string) {
  const license = await prisma.license.findUnique({ where: { workspaceId } });
  const domain = currentDomain();

  if (!license) {
    return {
      status: 'unverified' as LicenseStatus,
      message: 'No purchase code has been entered yet.',
      domain,
      exempt: isExemptDomain(domain),
      license: null,
    };
  }

  return {
    status: license.status,
    message: license.message ?? '',
    domain,
    exempt: isExemptDomain(domain),
    license,
  };
}
