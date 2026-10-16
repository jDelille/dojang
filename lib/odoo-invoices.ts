import { m2oName, searchCount, searchRead, type Many2one } from '@/lib/odoo';

/** Customer invoices from Odoo accounting (account.move). Read-only. */

export type OdooInvoice = {
  id: number;
  number: string;
  customer: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  total: number;
  due: number;
  currency: string | null;
  state: string; // draft | posted | cancel
  paymentState: string; // not_paid | in_payment | paid | partial | reversed
};

type InvoiceRow = {
  id: number;
  name: string | false;
  partner_id: Many2one;
  invoice_date: string | false;
  invoice_date_due: string | false;
  amount_total: number;
  amount_residual: number;
  currency_id: Many2one;
  state: string;
  payment_state: string;
};

export const INVOICE_FILTERS = ['unpaid', 'overdue', 'paid', 'draft'] as const;

export function countOverdueInvoices() {
  return searchCount('account.move', [
    ['move_type', '=', 'out_invoice'],
    ['state', '=', 'posted'],
    ['payment_state', 'in', ['not_paid', 'partial']],
    ['invoice_date_due', '<', new Date().toISOString().slice(0, 10)],
  ]);
}

export async function loadInvoices({
  filter,
  page,
  limit = 25,
}: {
  filter?: string;
  page: number;
  limit?: number;
}): Promise<{ invoices: OdooInvoice[]; total: number; pages: number }> {
  const domain: unknown[] = [['move_type', '=', 'out_invoice']];
  const today = new Date().toISOString().slice(0, 10);
  const open = [
    ['state', '=', 'posted'],
    ['payment_state', 'in', ['not_paid', 'partial']],
  ];
  if (filter === 'unpaid') domain.push(...open);
  if (filter === 'overdue') domain.push(...open, ['invoice_date_due', '<', today]);
  if (filter === 'paid') domain.push(['payment_state', 'in', ['paid', 'in_payment']]);
  if (filter === 'draft') domain.push(['state', '=', 'draft']);

  const [total, rows] = await Promise.all([
    searchCount('account.move', domain),
    searchRead<InvoiceRow>(
      'account.move',
      domain,
      ['name', 'partner_id', 'invoice_date', 'invoice_date_due', 'amount_total', 'amount_residual', 'currency_id', 'state', 'payment_state'],
      { order: 'invoice_date desc, id desc', limit, offset: (page - 1) * limit },
    ),
  ]);

  return {
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    invoices: rows.map((r) => ({
      id: r.id,
      number: r.name && r.name !== '/' ? r.name : '—',
      customer: m2oName(r.partner_id),
      invoiceDate: r.invoice_date || null,
      dueDate: r.invoice_date_due || null,
      total: r.amount_total,
      due: r.amount_residual,
      currency: m2oName(r.currency_id),
      state: r.state,
      paymentState: r.payment_state,
    })),
  };
}
