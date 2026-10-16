'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ExternalLink, Plus, Receipt, Send, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  Tr,
  useToast,
} from '@/components/ui';
import { StatTile } from '@/components/charts';
import { formatCurrency, formatDate } from '@/lib/utils';

type LineItem = { description: string; quantity: number; unitPrice: number };

type Invoice = {
  id: string;
  number: string;
  isEstimate: boolean;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  payLink: string | null;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
  contact: { id: string; name: string; email: string | null };
};

const PAGE_SIZE = 25;

const STATUS_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'alert' | 'warning'> = {
  draft: 'neutral',
  sent: 'accent',
  paid: 'success',
  overdue: 'alert',
  void: 'neutral',
};

/**
 * Money tiles are derived from one table so a new InvoiceStatus cannot quietly
 * fall out of the figures: anything a customer still owes belongs in
 * Outstanding, and only a voided invoice is owed by nobody.
 */
const TILES: { label: string; statuses: string[]; tone?: 'accent' }[] = [
  { label: 'Paid', statuses: ['paid'], tone: 'accent' },
  { label: 'Outstanding', statuses: ['sent', 'overdue'] },
  { label: 'Overdue', statuses: ['overdue'] },
  { label: 'Draft', statuses: ['draft'] },
];

const sumOf = (totals: Record<string, number>, statuses: string[]) =>
  statuses.reduce((sum, status) => sum + (totals[status] ?? 0), 0);

/** A sent invoice past its due date is late even before a job restamps it. */
const isPastDue = (invoice: Invoice) =>
  invoice.status === 'sent' && !!invoice.dueAt && new Date(invoice.dueAt).getTime() < Date.now();

export function InvoicesClient({ currency }: { currency: string }) {
  const t = useTranslations('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
      if (filter) params.set('status', filter);

      const res = await fetch(`/api/invoices?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Could not load invoices.');
        return;
      }
      setInvoices(data.invoices ?? []);
      setTotals(data.totalsByStatus ?? {});
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Switching tab changes the result set, so page 3 of the old one is meaningless.
  useEffect(() => {
    setPage(1);
  }, [filter]);

  const send = async (invoice: Invoice) => {
    setSendingId(invoice.id);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}?action=send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not send that invoice.', 'alert');
        return;
      }
      toast.show(`Sent to ${invoice.contact.email}.`, 'success');
      void load();
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setSendingId(null);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${pendingDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.show(data.error ?? 'Could not delete that invoice.', 'alert');
        return;
      }
      toast.show(`${pendingDelete.number} deleted.`, 'success');
      setPendingDelete(null);
      void load();
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setDeleting(false);
    }
  };

  const firstRow = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = (page - 1) * PAGE_SIZE + invoices.length;

  return (
    <>
      <PageHeader
        title={t('invoices')}
        description={t('sendAnInvoiceOrEstimate')}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />{t('newInvoice')}</Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => {
          const value = sumOf(totals, tile.statuses);
          const overdue = tile.label === 'Outstanding' ? sumOf(totals, ['overdue']) : 0;
          return (
            <StatTile
              key={tile.label}
              label={tile.label}
              value={formatCurrency(value, currency)}
              tone={tile.tone}
              hint={
                overdue > 0
                  ? `${formatCurrency(overdue, currency)} of it is overdue`
                  : tile.label === 'Overdue' && value === 0
                    ? 'Nothing past its terms'
                    : undefined
              }
            />
          );
        })}
      </div>

      <Tabs
        tabs={[
          { key: '', label: 'All' },
          { key: 'draft', label: 'Draft' },
          { key: 'sent', label: 'Sent' },
          { key: 'overdue', label: 'Overdue' },
          { key: 'paid', label: 'Paid' },
          { key: 'void', label: 'Void' },
        ]}
        active={filter}
        onChange={setFilter}
      />

      <Card className="mt-4">
        <CardHeader
          title={t('allInvoices')}
          description={
            !loading && !error && invoices.length
              ? `Showing ${firstRow}–${lastRow} of ${total}`
              : undefined
          }
        />
        {error ? (
          <ErrorBlock message={error} onRetry={() => void load()} />
        ) : loading ? (
          <LoadingBlock label={t('loadingInvoices')} />
        ) : invoices.length ? (
          <>
            <Table caption="Invoices and estimates">
              <thead>
                <tr>
                  <Th>{t('number')}</Th>
                  <Th>{t('customer')}</Th>
                  <Th align="right">{t('amount')}</Th>
                  <Th>{t('status')}</Th>
                  <Th>Due</Th>
                  <Th>{t('provider')}</Th>
                  <Th>{t('created')}</Th>
                  <Th align="right">{t('actions')}</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <Tr key={invoice.id}>
                    <Td>
                      <Link
                        href={`/dashboard/invoices/${invoice.id}`}
                        className="font-mono text-xs underline underline-offset-4 transition-colors hover:text-accent-dark dark:hover:text-accent"
                      >
                        {invoice.number}
                      </Link>
                      {invoice.isEstimate && <Badge className="ms-2">estimate</Badge>}
                    </Td>
                    <Td>
                      <p className="text-sm">{invoice.contact.name}</p>
                      <p className="text-xs muted">{invoice.contact.email ?? 'no email'}</p>
                    </Td>
                    <Td align="right" className="font-medium tabular-nums">
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[invoice.status] ?? 'neutral'}>{invoice.status}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      {invoice.dueAt ? (
                        <span className={isPastDue(invoice) ? 'text-alert' : 'muted'}>
                          {formatDate(invoice.dueAt)}
                          {isPastDue(invoice) && <span className="ms-1">· late</span>}
                        </span>
                      ) : (
                        <span className="muted">no terms</span>
                      )}
                    </Td>
                    <Td className="text-xs muted">{invoice.provider}</Td>
                    <Td className="whitespace-nowrap text-xs muted">
                      {formatDate(invoice.createdAt)}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        {invoice.payLink && (
                          <a
                            href={invoice.payLink}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`Open the pay link for ${invoice.number}`}
                            title={t('openPayLink')}
                            className="rounded-control p-1.5 muted transition-colors hover:text-[color:var(--color-fg)]"
                          >
                            <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                          </a>
                        )}
                        {invoice.status !== 'paid' && invoice.status !== 'void' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={sendingId === invoice.id}
                            onClick={() => void send(invoice)}
                          >
                            <Send className="h-4 w-4" strokeWidth={1.75} />
                            {invoice.status === 'draft' ? 'Send' : 'Resend'}
                          </Button>
                        )}
                        {invoice.status !== 'paid' && (
                          <button
                            type="button"
                            onClick={() => setPendingDelete(invoice)}
                            aria-label={`Delete ${invoice.number}`}
                            className="rounded-control p-1.5 muted transition-colors hover:text-alert"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>

            <Pagination
              page={page}
              pages={pages}
              total={total}
              onChange={setPage}
              label="invoices"
            />
          </>
        ) : (
          <EmptyState
            icon={<Receipt strokeWidth={1.75} />}
            title={filter ? `No ${filter} invoices` : 'No invoices yet'}
            description={
              filter
                ? 'Nothing sits in this state at the moment.'
                : 'Create one and Roster emails it with a Stripe or Paystack pay link.'
            }
            action={
              filter ? (
                <Button variant="secondary" size="sm" onClick={() => setFilter('')}>{t('showAllInvoices')}</Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>{t('newInvoice')}</Button>
              )
            }
          />
        )}
      </Card>

      <CreateInvoiceModal
        open={createOpen}
        currency={currency}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          toast.show('Invoice created as a draft.', 'success');
          void load();
        }}
        onError={(m) => toast.show(m, 'alert')}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void remove()}
        title={`Delete ${pendingDelete?.number ?? 'invoice'}?`}
        description={`${pendingDelete?.contact.name ?? 'The customer'} will keep any copy already emailed, but the record and its pay link go for good.`}
        confirmLabel={t('deleteInvoice')}
        destructive
        loading={deleting}
      />

      {toast.node}
    </>
  );
}

function CreateInvoiceModal({
  open,
  currency,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  currency: string;
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('invoices');
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [contactId, setContactId] = useState('');
  const [isEstimate, setIsEstimate] = useState(false);
  const [provider, setProvider] = useState('stripe');
  const [taxRate, setTaxRate] = useState(0);
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ]);
  const [contactsError, setContactsError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContactsError('');
    void fetch('/api/contacts?limit=200')
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts ?? []))
      .catch(() => setContactsError('Could not load your contacts. Close and reopen to retry.'));
  }, [open]);

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const total = subtotal * (1 + taxRate / 100);

  const submit = async () => {
    if (!contactId) return onError('Pick a customer.');
    const valid = items.filter((i) => i.description.trim());
    if (!valid.length) return onError('Add at least one line item.');

    setBusy(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          isEstimate,
          provider,
          taxRate,
          currency,
          lineItems: valid,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) return onError(data.error ?? 'Could not create that invoice.');
      setItems([{ description: '', quantity: 1, unitPrice: 0 }]);
      setContactId('');
      setDueAt('');
      setNotes('');
      onCreated();
    } catch {
      onError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={t('newInvoice')}
      description={t('createdAsADraftNothing')}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>{t('createDraft')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('customer')} required error={contactsError || undefined}>
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">{t('select')}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('type')}>
            <Select
              value={isEstimate ? 'estimate' : 'invoice'}
              onChange={(e) => setIsEstimate(e.target.value === 'estimate')}
            >
              <option value="invoice">{t('invoice')}</option>
              <option value="estimate">{t('estimate')}</option>
            </Select>
          </Field>
          <Field label={t('payWith')}>
            <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="stripe">{t('stripe')}</option>
              <option value="paystack">{t('paystack')}</option>
              <option value="manual">{t('noPayLink')}</option>
            </Select>
          </Field>
        </div>

        <div>
          <p className="label-caps mb-2">{t('lineItems')}</p>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_80px_110px_auto]">
                <Input
                  value={item.description}
                  onChange={(e) =>
                    setItems(items.map((it, i) => (i === index ? { ...it, description: e.target.value } : it)))
                  }
                  placeholder={t('description')}
                  aria-label={`Line ${index + 1} description`}
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  min={0}
                  value={item.quantity}
                  onChange={(e) =>
                    setItems(
                      items.map((it, i) =>
                        i === index ? { ...it, quantity: Number(e.target.value) } : it,
                      ),
                    )
                  }
                  className="h-8 text-xs"
                  aria-label={`Line ${index + 1} quantity`}
                  title={t('quantity')}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) =>
                    setItems(
                      items.map((it, i) =>
                        i === index ? { ...it, unitPrice: Number(e.target.value) } : it,
                      ),
                    )
                  }
                  className="h-8 text-xs"
                  aria-label={`Line ${index + 1} unit price`}
                  title={t('unitPrice')}
                />
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, i) => i !== index))}
                  disabled={items.length === 1}
                  aria-label={`Remove line ${index + 1}`}
                  className="rounded-control p-1.5 muted transition-colors hover:text-alert disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setItems([...items, { description: '', quantity: 1, unitPrice: 0 }])}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />{t('addLine')}</Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('taxRate')}>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
            />
          </Field>
          <Field label={t('dueDate')} hint="payment terms">
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
        </div>

        <Field label={t('notes')} hint="shown on the emailed invoice">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            placeholder={t('paymentTermsBankDetailsA')}
          />
        </Field>

        <div className="flex justify-end border-t border-[color:var(--color-border)] pt-4">
          <div className="text-end">
            <p className="text-xs muted">
              Subtotal {formatCurrency(subtotal, currency)}
              {taxRate > 0 && ` · tax ${taxRate}%`}
            </p>
            <p className="font-display text-lg font-semibold tabular-nums">
              {formatCurrency(total, currency)}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
