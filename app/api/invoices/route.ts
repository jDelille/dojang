import { prisma } from '@/lib/db';
import { created, fail, ok, paginationFrom, parseBody, searchParams, withWorkspace } from '@/lib/api';
import { invoiceCreateSchema } from '@/lib/validation';
import { nextInvoiceNumber, logActivity } from '@/lib/workspace';
import type { Prisma } from '@prisma/client';

/** Invoice/estimate creation (spec §4.8). The pay link is minted on send. */

export const GET = withWorkspace(async (ctx, req) => {
  const sp = searchParams(req);
  const { take, skip, page } = paginationFrom(req, 25);
  const status = sp.get('status');

  const where: Prisma.InvoiceWhereInput = { workspaceId: ctx.workspaceId };
  if (status) where.status = status as never;

  const [invoices, total, totals] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: { contact: { select: { id: true, name: true, email: true } } },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.groupBy({
      by: ['status'],
      where: { workspaceId: ctx.workspaceId },
      _sum: { amount: true },
    }),
  ]);

  return ok({
    invoices: invoices.map((i) => ({
      ...i,
      amount: Number(i.amount),
      subtotal: Number(i.subtotal),
      taxRate: Number(i.taxRate),
    })),
    total,
    page,
    pages: Math.ceil(total / take),
    totalsByStatus: Object.fromEntries(
      totals.map((t) => [t.status, Number(t._sum.amount ?? 0)]),
    ),
  });
}, 'leads:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, invoiceCreateSchema);

  const contact = await prisma.contact.findFirst({
    where: { id: body.contactId, workspaceId: ctx.workspaceId },
    select: { id: true, name: true },
  });
  if (!contact) return fail(404, 'Contact not found in this workspace.');

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { currency: true },
  });

  const subtotal = body.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const taxRate = body.taxRate ?? 0;
  const amount = subtotal * (1 + taxRate / 100);

  const invoice = await prisma.invoice.create({
    data: {
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      number: await nextInvoiceNumber(ctx.workspaceId, body.isEstimate ?? false),
      isEstimate: body.isEstimate ?? false,
      lineItems: body.lineItems as never,
      subtotal,
      taxRate,
      amount,
      currency: body.currency ?? workspace.currency,
      provider: body.provider ?? 'stripe',
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      notes: body.notes ?? null,
      status: 'draft',
    },
    include: { contact: { select: { id: true, name: true, email: true } } },
  });

  await logActivity({
    workspaceId: ctx.workspaceId,
    contactId: contact.id,
    userId: ctx.userId,
    type: 'invoice',
    title: `${invoice.isEstimate ? 'Estimate' : 'Invoice'} ${invoice.number} created`,
  });

  return created({
    invoice: { ...invoice, amount: Number(invoice.amount), subtotal: Number(invoice.subtotal) },
  });
}, 'invoices:write');
