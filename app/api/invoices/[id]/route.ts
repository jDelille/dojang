import { prisma } from '@/lib/db';
import { fail, noContent, ok, parseBody, routeParam, searchParams, withWorkspace } from '@/lib/api';
import { invoiceUpdateSchema } from '@/lib/validation';
import { createStripePayLink } from '@/lib/integrations/stripe';
import { createPaystackPayLink } from '@/lib/integrations/paystack';
import { renderTransactional, renderSubject } from '@/lib/email-templates';
import { renderEmail, sendEmail, escapeHtml } from '@/lib/integrations/mailer';
import { formatCurrency } from '@/lib/utils';
import { logActivity } from '@/lib/workspace';

/** Invoice update + `?action=send` (mint pay link, email it to the customer). */

export const GET = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const invoice = await prisma.invoice.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: { contact: true },
  });
  if (!invoice) return fail(404, 'Invoice not found.');

  return ok({ invoice: { ...invoice, amount: Number(invoice.amount), subtotal: Number(invoice.subtotal) } });
}, 'leads:read');

export const PATCH = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const body = await parseBody(req, invoiceUpdateSchema);

  const existing = await prisma.invoice.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
  });
  if (!existing) return fail(404, 'Invoice not found.');
  if (existing.status === 'paid' && body.lineItems) {
    return fail(409, 'A paid invoice cannot have its line items changed.');
  }

  const lineItems = body.lineItems ?? (existing.lineItems as never as { quantity: number; unitPrice: number }[]);
  const subtotal = lineItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const taxRate = body.taxRate ?? Number(existing.taxRate);

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      lineItems: body.lineItems as never,
      subtotal,
      taxRate,
      amount: subtotal * (1 + taxRate / 100),
      currency: body.currency,
      provider: body.provider,
      status: body.status,
      notes: body.notes,
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    },
  });

  return ok({ invoice: { ...invoice, amount: Number(invoice.amount), subtotal: Number(invoice.subtotal) } });
}, 'invoices:write');

export const POST = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const action = searchParams(req).get('action');
  if (action !== 'send') return fail(400, 'Unsupported action. Use ?action=send.');

  const invoice = await prisma.invoice.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: { contact: true },
  });
  if (!invoice) return fail(404, 'Invoice not found.');
  if (!invoice.contact.email) {
    return fail(422, 'That contact has no email address, so the invoice cannot be sent.');
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const amount = Number(invoice.amount);

  // ── Mint the pay link ──────────────────────────────────────────────────────
  let payLink = invoice.payLink;
  let externalRef = invoice.externalRef;

  if (!payLink && invoice.provider !== 'manual') {
    try {
      if (invoice.provider === 'stripe') {
        const result = await createStripePayLink(ctx.workspaceId, {
          invoiceNumber: invoice.number,
          description: `${invoice.isEstimate ? 'Estimate' : 'Invoice'} from ${workspace.businessName || workspace.name}`,
          amount,
          currency: invoice.currency,
          customerEmail: invoice.contact.email,
          successUrl: `${appUrl}/pay/success?invoice=${invoice.id}`,
          cancelUrl: `${appUrl}/pay/cancelled?invoice=${invoice.id}`,
          metadata: { invoiceId: invoice.id, workspaceId: ctx.workspaceId },
        });
        payLink = result.url;
        externalRef = result.externalRef;
      } else {
        const result = await createPaystackPayLink(ctx.workspaceId, {
          email: invoice.contact.email,
          amount,
          currency: invoice.currency,
          reference: `${invoice.id}-${Date.now()}`,
          callbackUrl: `${appUrl}/pay/success?invoice=${invoice.id}`,
          metadata: { invoiceId: invoice.id, workspaceId: ctx.workspaceId },
        });
        payLink = result.url;
        externalRef = result.externalRef;
      }
    } catch (error) {
      return fail(502, `Could not create a payment link: ${(error as Error).message}`);
    }
  }

  // ── Email it ───────────────────────────────────────────────────────────────
  const items = invoice.lineItems as never as {
    description: string;
    quantity: number;
    unitPrice: number;
  }[];

  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:6px 0;">${escapeHtml(item.description)} <span style="color:#5B6472;">× ${item.quantity}</span></td><td style="padding:6px 0;text-align:right;">${escapeHtml(formatCurrency(item.quantity * item.unitPrice, invoice.currency))}</td></tr>`,
    )
    .join('');

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(invoice.contact.name)},</p>
    <p style="margin:0 0 16px;">Here is ${invoice.isEstimate ? 'your estimate' : 'your invoice'} <strong>${escapeHtml(invoice.number)}</strong> from ${escapeHtml(workspace.businessName || workspace.name)}.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
      ${rows}
      <tr><td style="padding:10px 0 0;border-top:1px solid #E7E9EC;font-weight:600;">Total</td>
          <td style="padding:10px 0 0;border-top:1px solid #E7E9EC;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(amount, invoice.currency))}</td></tr>
    </table>
    ${invoice.notes ? `<p style="margin:0 0 16px;color:#5B6472;">${escapeHtml(invoice.notes)}</p>` : ''}`;

  const brand = {
    businessName: workspace.businessName || workspace.name,
    accentColor: workspace.accentColor,
    logoUrl: workspace.logoUrl,
  };
  const vars = {
    name: invoice.contact.name,
    first_name: invoice.contact.name?.split(/\s+/)[0] ?? 'there',
    business: brand.businessName,
    invoice_number: invoice.number,
    amount: formatCurrency(amount, invoice.currency),
    due_date: invoice.dueAt ? invoice.dueAt.toDateString() : '',
    pay_link: payLink ?? '',
  };

  try {
    await sendEmail(ctx.workspaceId, {
      to: invoice.contact.email,
      subject: await renderSubject(
        ctx.workspaceId,
        'invoice',
        `${invoice.isEstimate ? 'Estimate' : 'Invoice'} ${invoice.number} from ${brand.businessName}`,
        vars,
      ),
      html: await renderTransactional(
        ctx.workspaceId,
        'invoice',
        brand,
        bodyHtml,
        vars,
        payLink ? { label: `Pay ${formatCurrency(amount, invoice.currency)}`, url: payLink } : undefined,
      ),
      replyTo: workspace.businessEmail ?? undefined,
    });
  } catch (error) {
    return fail(502, `Could not send the email: ${(error as Error).message}`);
  }

  const updated = await prisma.invoice.update({
    where: { id },
    data: { payLink, externalRef, status: 'sent', sentAt: new Date() },
  });

  await logActivity({
    workspaceId: ctx.workspaceId,
    contactId: invoice.contactId,
    userId: ctx.userId,
    type: 'invoice',
    title: `${invoice.number} sent to ${invoice.contact.email}`,
  });

  return ok({ invoice: { ...updated, amount: Number(updated.amount), subtotal: Number(updated.subtotal) } });
}, 'invoices:write');

export const DELETE = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const invoice = await prisma.invoice.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true, status: true },
  });
  if (!invoice) return fail(404, 'Invoice not found.');
  if (invoice.status === 'paid') {
    return fail(409, 'A paid invoice cannot be deleted. Void it instead.');
  }

  await prisma.invoice.delete({ where: { id } });
  return noContent();
}, 'invoices:write');
