import Stripe from 'stripe';
import { getCredentials } from '@/lib/credentials';

/** Stripe — primary payment provider for the buyer's end customers (spec §4.8). */

export class StripeNotConfiguredError extends Error {
  constructor() {
    super('Stripe is not configured. Add your secret key in Settings → Integrations.');
  }
}

export async function getStripeClient(workspaceId: string): Promise<Stripe> {
  const { secretKey } = await getCredentials(workspaceId, 'stripe');
  if (!secretKey) throw new StripeNotConfiguredError();
  return new Stripe(secretKey, { maxNetworkRetries: 2 });
}

export type PayLinkInput = {
  invoiceNumber: string;
  description: string;
  amount: number;
  currency: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
};

/**
 * Creates a hosted Checkout session and returns its URL. Checkout is used
 * rather than Payment Links so the invoice id rides along in metadata and the
 * webhook can reconcile it back to the contact record.
 */
export async function createStripePayLink(
  workspaceId: string,
  input: PayLinkInput,
): Promise<{ url: string; externalRef: string }> {
  const stripe = await getStripeClient(workspaceId);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: Math.round(input.amount * 100),
          product_data: {
            name: `Invoice ${input.invoiceNumber}`,
            description: input.description.slice(0, 300) || undefined,
          },
        },
      },
    ],
    customer_email: input.customerEmail ?? undefined,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: input.metadata,
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL.');
  return { url: session.url, externalRef: session.id };
}

/** Verifies the webhook signature; throws if the payload was tampered with. */
export async function constructStripeEvent(
  workspaceId: string,
  payload: string,
  signature: string,
): Promise<Stripe.Event> {
  const stripe = await getStripeClient(workspaceId);
  const { webhookSecret } = await getCredentials(workspaceId, 'stripe');

  if (!webhookSecret) {
    throw new Error('No Stripe webhook secret configured — cannot verify this event.');
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export async function verifyStripe(secretKey: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const stripe = new Stripe(secretKey);
    await stripe.balance.retrieve();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
