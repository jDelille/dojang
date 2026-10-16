import { prisma } from '@/lib/db';
import { fail, ok, withPublic } from '@/lib/api';
import { constructStripeEvent } from '@/lib/integrations/stripe';
import { logActivity } from '@/lib/workspace';
import { sendPush } from '@/lib/integrations/push';

/**
 * Stripe webhook (spec §6). Payment status is synced back to the contact
 * record via the invoice.
 *
 * The workspace is read from the session metadata we set when the Checkout
 * session was created — that's how a multi-tenant install routes one webhook
 * endpoint to the right tenant's signing secret.
 */
export const POST = withPublic(async (req) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return fail(400, 'Missing stripe-signature header.');

  const payload = await req.text();

  // We need the workspace before we can verify, so read the metadata from the
  // unverified body first — then *verify* with that workspace's secret. The
  // signature check is still authoritative; a forged body simply fails it.
  let workspaceId: string | undefined;
  try {
    const parsed = JSON.parse(payload) as {
      data?: { object?: { metadata?: Record<string, string> } };
    };
    workspaceId = parsed.data?.object?.metadata?.workspaceId;
  } catch {
    return fail(400, 'Malformed webhook body.');
  }

  if (!workspaceId) {
    // Not one of ours (or metadata was stripped) — acknowledge so Stripe
    // doesn't retry forever.
    return ok({ ignored: true });
  }

  let event;
  try {
    event = await constructStripeEvent(workspaceId, payload, signature);
  } catch (error) {
    return fail(400, `Signature verification failed: ${(error as Error).message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return ok({ ignored: event.type });
  }

  const session = event.data.object as {
    id: string;
    metadata?: Record<string, string>;
    amount_total?: number;
    payment_status?: string;
  };
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId || session.payment_status !== 'paid') return ok({ ignored: true });

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: { contact: { select: { id: true, name: true } } },
  });
  if (!invoice) return ok({ ignored: 'unknown invoice' });
  if (invoice.status === 'paid') return ok({ alreadyPaid: true });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: 'paid', paidAt: new Date(), externalRef: session.id },
  });

  await logActivity({
    workspaceId,
    contactId: invoice.contactId,
    type: 'invoice',
    title: `${invoice.number} paid via Stripe`,
    meta: { sessionId: session.id },
  });

  await sendPush(workspaceId, {
    title: 'Invoice paid',
    body: `${invoice.contact.name} paid ${invoice.number}.`,
    url: '/dashboard/invoices',
  });

  return ok({ received: true });
});
