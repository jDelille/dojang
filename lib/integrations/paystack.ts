import crypto from 'node:crypto';
import { getCredentials } from '@/lib/credentials';

/**
 * Paystack — secondary payment provider (spec §2). Paystack has no official
 * Node SDK, so this is a thin typed wrapper over its REST API.
 *
 * Amounts are in the currency's subunit (kobo for NGN, cents for USD/GHS/ZAR).
 */

const API_BASE = 'https://api.paystack.co';

export class PaystackNotConfiguredError extends Error {
  constructor() {
    super('Paystack is not configured. Add your secret key in Settings → Integrations.');
  }
}

async function getSecretKey(workspaceId: string): Promise<string> {
  const { secretKey } = await getCredentials(workspaceId, 'paystack');
  if (!secretKey) throw new PaystackNotConfiguredError();
  return secretKey;
}

async function request<T>(
  secretKey: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  const data = (await response.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: T;
  };

  if (!response.ok || data.status === false) {
    throw new Error(data.message || `Paystack returned HTTP ${response.status}.`);
  }

  return data.data as T;
}

export type PaystackInitInput = {
  email: string;
  amount: number; // major units — converted below
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
};

export async function createPaystackPayLink(
  workspaceId: string,
  input: PaystackInitInput,
): Promise<{ url: string; externalRef: string }> {
  const secretKey = await getSecretKey(workspaceId);

  const currency = input.currency.toUpperCase();

  let data;
  try {
    data = await request<{ authorization_url: string; reference: string }>(
      secretKey,
      '/transaction/initialize',
      {
        method: 'POST',
        body: {
          email: input.email,
          // Paystack bills in the smallest unit — kobo, pesewa, cents.
          amount: Math.round(input.amount * 100),
          currency,
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: input.metadata ?? {},
        },
      },
    );
  } catch (error) {
    // A Paystack account only accepts the currencies of the country it was
    // registered in, so this fires on every invoice in any other currency.
    // The raw message does not say that, and leaves the operator stuck.
    if (/currency not supported/i.test((error as Error).message)) {
      throw new Error(
        `Your Paystack account cannot accept ${currency}. Paystack enables only the ` +
          `currencies of the country the account was registered in. Either set this ` +
          `invoice's currency to one it supports, or bill it through Stripe instead.`,
      );
    }
    throw error;
  }

  return { url: data.authorization_url, externalRef: data.reference };
}

export async function verifyPaystackTransaction(
  workspaceId: string,
  reference: string,
): Promise<{ status: string; amount: number; currency: string; paidAt: string | null }> {
  const secretKey = await getSecretKey(workspaceId);
  const data = await request<{
    status: string;
    amount: number;
    currency: string;
    paid_at: string | null;
  }>(secretKey, `/transaction/verify/${encodeURIComponent(reference)}`);

  return {
    status: data.status,
    amount: data.amount / 100,
    currency: data.currency,
    paidAt: data.paid_at,
  };
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body. */
export async function verifyPaystackSignature(
  workspaceId: string,
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  const secretKey = await getSecretKey(workspaceId);
  const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function verifyPaystack(secretKey: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await request(secretKey, '/bank?perPage=1');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
