import { getTranslations } from 'next-intl/server';
import { Receipt } from 'lucide-react';
import { requireWorkspace } from '@/lib/session';
import { InvoicesClient } from '@/components/invoices/invoices-client';
import { Card, CardHeader, EmptyState, PageHeader, Table, Td, Th, Tr } from '@/components/ui';
import { odooConfigured } from '@/lib/odoo';
import { INVOICE_FILTERS, loadInvoices, type OdooInvoice } from '@/lib/odoo-invoices';
import { Chips, LinkPager, Pill, withParams } from '@/components/odoo/shared';
import { formatCurrency } from '@/lib/utils';

export const metadata = { title: 'Invoices' };

const PATH = '/dashboard/invoices';

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const { workspace } = await requireWorkspace();
  // Without Odoo, fall back to Roster's own invoices.
  if (!odooConfigured()) return <InvoicesClient currency={workspace.currency} />;

  const t = await getTranslations('odoo');
  const params = await searchParams;
  const filter = (INVOICE_FILTERS as readonly string[]).includes(params.filter ?? '') ? params.filter! : '';
  const page = Math.max(1, Number(params.page) || 1);

  let data: { invoices: OdooInvoice[]; total: number; pages: number } | null = null;
  try {
    data = await loadInvoices({ filter, page });
  } catch (error) {
    console.error('[invoices] Odoo read failed:', error);
  }

  const today = new Date().toISOString().slice(0, 10);
  const money = (amount: number, currency: string | null) => {
    try {
      return formatCurrency(amount, currency ?? workspace.currency);
    } catch {
      return amount.toFixed(2);
    }
  };

  return (
    <>
      <PageHeader title={t('invoices.title')} description={t('invoices.description')} />
      <Card>
        {!data ? (
          <EmptyState icon={<Receipt strokeWidth={1.75} />} title={t('unavailableTitle')} description={t('unavailable')} />
        ) : (
          <>
            <CardHeader title={t('invoices.count', { count: data.total })} />
            <Chips
              label={t('invoices.filter')}
              items={[
                { key: 'all', label: t('all'), href: PATH, active: !filter },
                ...INVOICE_FILTERS.map((f) => ({ key: f, label: t(`invoices.filters.${f}`), href: withParams(PATH, { filter: f }), active: f === filter })),
              ]}
            />
            {data.invoices.length ? (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('invoices.number')}</Th>
                      <Th>{t('invoices.customer')}</Th>
                      <Th>{t('invoices.date')}</Th>
                      <Th>{t('invoices.due')}</Th>
                      <Th align="right">{t('invoices.total')}</Th>
                      <Th align="right">{t('invoices.outstanding')}</Th>
                      <Th>{t('invoices.status')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((inv) => {
                      const overdue = inv.state === 'posted' && inv.due > 0 && !!inv.dueDate && inv.dueDate < today;
                      return (
                        <Tr key={inv.id}>
                          <Td className="font-mono text-xs">{inv.number}</Td>
                          <Td className="text-xs">{inv.customer ?? '—'}</Td>
                          <Td className="whitespace-nowrap text-xs muted">{inv.invoiceDate ?? '—'}</Td>
                          <Td className={overdue ? 'whitespace-nowrap text-xs text-alert' : 'whitespace-nowrap text-xs muted'}>{inv.dueDate ?? '—'}</Td>
                          <Td align="right" className="text-xs tabular-nums">
                            {money(inv.total, inv.currency)}
                          </Td>
                          <Td align="right" className="text-xs tabular-nums">
                            {money(inv.due, inv.currency)}
                          </Td>
                          <Td>
                            {inv.state === 'draft' ? (
                              <Pill>{t('invoices.filters.draft')}</Pill>
                            ) : inv.state === 'cancel' ? (
                              <Pill>{t('invoices.cancelled')}</Pill>
                            ) : overdue ? (
                              <Pill tone="alert">{t('invoices.filters.overdue')}</Pill>
                            ) : inv.paymentState === 'paid' || inv.paymentState === 'in_payment' ? (
                              <Pill tone="success">{t('invoices.filters.paid')}</Pill>
                            ) : (
                              <Pill tone="warning">{t('invoices.filters.unpaid')}</Pill>
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
                <LinkPager
                  page={page}
                  pages={data.pages}
                  summary={t('pageOf', { page, pages: data.pages, total: data.total })}
                  href={(p) => withParams(PATH, { filter, page: p })}
                  labels={{ previous: t('previous'), next: t('next'), nav: t('pagination') }}
                />
              </>
            ) : (
              <EmptyState icon={<Receipt strokeWidth={1.75} />} title={t('invoices.none')} description={t('invoices.noneHint')} />
            )}
          </>
        )}
      </Card>
    </>
  );
}
