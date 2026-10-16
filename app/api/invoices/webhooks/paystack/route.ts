import { prisma } from '@/lib/db';
import { fail, ok, withPublic } from '@/lib/api';
import { verifyPaystackSignature, verifyPaystackTransaction } from '@/lib/integrations/paystack';
import { logActivity } from '@/lib/workspace';
import { sendPush } from '@/lib/integrations/push';

/** Paystack webhook — same contract as the Stripe handler (spec §6). */
export const POST = withPublic(async (req) => {
  const signature = req.headers.get('x-paystack-signature');
  const payload = await req.text();

  let body: {
    event?: string;
    data?: { reference?: string; status?: string; metadata?: Record<string, string> };
  };
  try {
    body = JSON.parse(payload);
  } catch {
    return fail(400, 'Malformed webhook body.');
  }

  const workspaceId = body.data?.metadata?.workspaceId;
  const invoiceId = body.data?.metadata?.invoiceId;
  if (!workspaceId || !invoiceId) return ok({ ignored: true });

  const signatureValid = await verifyPaystackSignature(workspaceId, payload, signature);
  if (!signatureValid) return fail(400, 'Invalid Paystack signature.');

  if (body.event !== 'charge.success') return ok({ ignored: body.event });

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: { contact: { select: { id: true, name: true } } },
  });
  if (!invoice) return ok({ ignored: 'unknown invoice' });
  if (invoice.status === 'paid') return ok({ alreadyPaid: true });

  // Confirm server-side rather than trusting the webhook body alone.
  const reference = body.data?.reference;
  if (reference) {
    try {
      const verified = await verifyPaystackTransaction(workspaceId, reference);
      if (verified.status !== 'success') return ok({ ignored: 'not successful' });
    } catch (error) {
      return fail(502, `Could not verify with Paystack: ${(error as Error).message}`);
    }
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: 'paid', paidAt: new Date(), externalRef: reference ?? invoice.externalRef },
  });

  await logActivity({
    workspaceId,
    contactId: invoice.contactId,
    type: 'invoice',
    title: `${invoice.number} paid via Paystack`,
    meta: { reference },
  });

  await sendPush(workspaceId, {
    title: 'Invoice paid',
    body: `${invoice.contact.name} paid ${invoice.number}.`,
    url: '/dashboard/invoices',
  });

  return ok({ received: true });
});
