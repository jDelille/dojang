'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Ban,
  Check,
  Copy,
  ExternalLink,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

type LineItem = { description: string; quantity: number; unitPrice: number };

type InvoiceRecord = {
  id: string;
  number: string;
  isEstimate: boolean;
  lineItems: LineItem[];
  subtotal: number;
  /** Prisma Decimal fields arrive as strings over JSON. */
  taxRate: number | string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  payLink: string | null;
  externalRef: string | null;
  dueAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  notes: string | null;
  contact: { id: string; name: string; email: string | null; phone: string | null };
};

const STATUS_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'alert' | 'warning'> = {
  draft: 'neutral',
  sent: 'accent',
  paid: 'success',
  overdue: 'alert',
  void: 'neutral',
};

const EMPTY_LINE: LineItem = { description: '', quantity: 1, unitPrice: 0 };

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Everything you can do to an invoice after it exists: read the line items,
 * fix them, set terms, send, take payment off-platform, void or delete.
 * The record is fetched here rather than server-rendered so that sending or
 * voiding re-reads the truth without a full page round trip.
 */
export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations('invoices');
  const router = useRouter();
  const toast = useToast();

  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [items, setItems] = useState<LineItem[]>([EMPTY_LINE]);
  const [taxRate, setTaxRate] = useState(0);
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [provider, setProvider] = useState('stripe');

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hydrate = useCallback((record: InvoiceRecord) => {
    setInvoice(record);
    setItems(record.lineItems?.length ? record.lineItems : [EMPTY_LINE]);
    setTaxRate(Number(record.taxRate ?? 0));
    setDueAt(record.dueAt ? record.dueAt.slice(0, 10) : '');
    setNotes(record.notes ?? '');
    setProvider(record.provider);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not load this invoice.');
        return;
      }
      hydrate(data.invoice);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [invoiceId, hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingBlock label={t('loadingInvoice')} />;
  if (error || !invoice) {
    return (
      <>
        <ErrorBlock message={error || 'Invoice not found.'} onRetry={() => void load()} />
        {toast.node}
      </>
    );
  }

  const paid = invoice.status === 'paid';
  const voided = invoice.status === 'void';
  // The API refuses line-item changes on a paid invoice, and a voided one is history.
  const linesLocked = paid || voided;

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const total = subtotal * (1 + taxRate / 100);

  const dirty =
    JSON.stringify(items) !== JSON.stringify(invoice.lineItems ?? []) ||
    taxRate !== Number(invoice.taxRate ?? 0) ||
    dueAt !== (invoice.dueAt ? invoice.dueAt.slice(0, 10) : '') ||
    notes !== (invoice.notes ?? '') ||
    provider !== invoice.provider;

  const patch = async (body: Record<string, unknown>, successMessage: string) => {
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.show(data.error ?? 'Could not update this invoice.', 'alert');
      return false;
    }
    // Re-seed from the saved record: the server recalculates the totals, and a
    // cleared due date is ignored rather than unset, so the draft can drift.
    hydrate({ ...invoice, ...data.invoice, contact: invoice.contact });
    toast.show(successMessage, 'success');
    router.refresh();
    return true;
  };

  const save = async () => {
    const kept = items.filter((i) => i.description.trim());
    if (!linesLocked && !kept.length) {
      toast.show('An invoice needs at least one line item.', 'alert');
      return;
    }

    setSaving(true);
    try {
      await patch(
        {
          ...(linesLocked ? {} : { lineItems: kept, taxRate }),
          provider,
          notes: notes.trim() || null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        },
        'Invoice saved.',
      );
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: string, message: string) => {
    setStatusBusy(true);
    try {
      await patch({ status }, message);
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setStatusBusy(false);
      setConfirmVoid(false);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}?action=send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not send this invoice.', 'alert');
        return;
      }
      hydrate({ ...invoice, ...data.invoice, contact: invoice.contact });
      toast.show(`Sent to ${invoice.contact.email}.`, 'success');
      router.refresh();
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setSending(false);
    }
  };

  const duplicate = async () => {
    setDuplicating(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: invoice.contact.id,
          isEstimate: invoice.isEstimate,
          provider,
          taxRate,
          currency: invoice.currency,
          lineItems: items.filter((i) => i.description.trim()),
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not duplicate this invoice.', 'alert');
        return;
      }
      router.push(`/dashboard/invoices/${data.invoice.id}`);
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setDuplicating(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.show(data.error ?? 'Could not delete this invoice.', 'alert');
        return;
      }
      router.push('/dashboard/invoices');
      router.refresh();
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      {/* Which invoice this is. Without it the page opens straight onto
          "Line items" with the number nowhere on screen. */}
      <PageHeader
        title={`${invoice.isEstimate ? 'Estimate' : 'Invoice'} ${invoice.number}`}
        description={`${invoice.contact.name} · raised ${formatDate(invoice.createdAt)}`}
        actions={
          <div className="text-end">
            <p className="font-display text-xl font-semibold leading-none tracking-tight tabular-nums">
              {formatCurrency(invoice.amount, invoice.currency)}
            </p>
            <p className="mt-1 text-2xs muted">
              {paid ? 'paid in full' : invoice.dueAt ? `due ${formatDate(invoice.dueAt)}` : 'no due date'}
            </p>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title={t('lineItems')}
              description={
                linesLocked
                  ? paid
                    ? 'This invoice has been paid, so its lines are fixed.'
                    : 'This invoice is void, so its lines are fixed.'
                  : 'Amounts are recalculated when you save.'
              }
            />
            <CardBody className="space-y-3">
              <div className="hidden grid-cols-1 gap-2 px-1 text-xs muted sm:grid sm:grid-cols-[1fr_80px_110px_100px_32px]">
                <span>{t('description')}</span>
                <span>Qty</span>
                <span>{t('unitPrice')}</span>
                <span className="text-end">{t('lineTotal')}</span>
                <span className="sr-only">{t('remove')}</span>
              </div>

              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_80px_110px_100px_32px] sm:items-center"
                >
                  <Input
                    value={item.description}
                    disabled={linesLocked}
                    maxLength={300}
                    onChange={(e) =>
                      setItems(
                        items.map((it, i) =>
                          i === index ? { ...it, description: e.target.value } : it,
                        ),
                      )
                    }
                    placeholder={t('description')}
                    aria-label={`Line ${index + 1} description`}
                    className="h-9 text-xs"
                  />
                  <Input
                    type="number"
                    min={0}
                    disabled={linesLocked}
                    value={item.quantity}
                    onChange={(e) =>
                      setItems(
                        items.map((it, i) =>
                          i === index ? { ...it, quantity: toNumber(e.target.value) } : it,
                        ),
                      )
                    }
                    aria-label={`Line ${index + 1} quantity`}
                    className="h-9 text-xs"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={linesLocked}
                    value={item.unitPrice}
                    onChange={(e) =>
                      setItems(
                        items.map((it, i) =>
                          i === index ? { ...it, unitPrice: toNumber(e.target.value) } : it,
                        ),
                      )
                    }
                    aria-label={`Line ${index + 1} unit price`}
                    className="h-9 text-xs"
                  />
                  <p className="text-xs tabular-nums sm:text-end">
                    {formatCurrency(item.quantity * item.unitPrice, invoice.currency)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, i) => i !== index))}
                    disabled={linesLocked || items.length === 1}
                    aria-label={`Remove line ${index + 1}`}
                    className="justify-self-start rounded-control p-1.5 muted transition-colors hover:text-alert disabled:opacity-30 sm:justify-self-center"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              ))}

              {!linesLocked && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={items.length >= 50}
                  onClick={() => setItems([...items, { ...EMPTY_LINE }])}
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} />{t('addLine')}</Button>
              )}

              <div className="grid grid-cols-1 gap-4 border-t border-[color:var(--color-border)] pt-4 sm:grid-cols-2">
                <Field label={t('taxRate')}>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    disabled={linesLocked}
                    value={taxRate}
                    onChange={(e) => setTaxRate(toNumber(e.target.value))}
                  />
                </Field>
                <div className="flex items-end justify-end">
                  <div className="text-end">
                    <p className="text-xs muted">
                      Subtotal {formatCurrency(subtotal, invoice.currency)}
                      {taxRate > 0 &&
                        ` · tax ${taxRate}% (${formatCurrency(total - subtotal, invoice.currency)})`}
                    </p>
                    <p className="font-display text-lg font-semibold tabular-nums">
                      {formatCurrency(total, invoice.currency)}
                    </p>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('notes')} description={t('includedAtTheBottomOf')} />
            <CardBody>
              <Field label={t('notes')}>
                <Textarea
                  value={notes}
                  maxLength={2000}
                  disabled={voided}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('paymentTermsBankDetailsA')}
                  className="min-h-[120px]"
                />
              </Field>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('status')} />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[invoice.status] ?? 'neutral'}>{invoice.status}</Badge>
                {invoice.isEstimate && <Badge>estimate</Badge>}
                <span className="text-xs muted">{invoice.currency}</span>
              </div>

              <Field label={t('dueDate')} hint="payment terms">
                <Input
                  type="date"
                  value={dueAt}
                  disabled={voided}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </Field>

              <Field
                label={t('payWith')}
                hint={invoice.payLink ? 'link already minted' : undefined}
              >
                <Select
                  value={provider}
                  disabled={!!invoice.payLink || linesLocked}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="stripe">{t('stripe')}</option>
                  <option value="paystack">{t('paystack')}</option>
                  <option value="manual">{t('noPayLink')}</option>
                </Select>
              </Field>

              <div className="space-y-2">
                {!paid && !voided && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    loading={sending}
                    disabled={!invoice.contact.email || dirty}
                    onClick={() => void send()}
                  >
                    <Send className="h-4 w-4" strokeWidth={1.75} />
                    {invoice.status === 'draft' ? 'Send invoice' : 'Resend invoice'}
                  </Button>
                )}
                {!invoice.contact.email && !paid && !voided && (
                  <p className="text-xs muted">
                    {invoice.contact.name} has no email address, so this cannot be sent.
                  </p>
                )}
                {dirty && !paid && !voided && (
                  <p className="text-xs muted">{t('saveYourChangesBeforeSending')}</p>
                )}

                {!paid && !voided && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    loading={statusBusy}
                    onClick={() => void changeStatus('paid', 'Marked as paid.')}
                  >
                    <Check className="h-4 w-4" strokeWidth={1.75} />{t('markAsPaid')}</Button>
                )}

                {invoice.payLink && (
                  <a
                    href={invoice.payLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex w-full items-center justify-center gap-1.5 rounded-control border border-[color:var(--color-border)] px-3 py-1.5 text-xs transition-colors hover:border-[color:var(--color-fg-muted)]"
                  >
                    Open pay link
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </a>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  loading={duplicating}
                  onClick={() => void duplicate()}
                >
                  <Copy className="h-4 w-4" strokeWidth={1.75} />{t('duplicateAsDraft')}</Button>

                {!voided && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setConfirmVoid(true)}
                  >
                    <Ban className="h-4 w-4" strokeWidth={1.75} />{t('voidInvoice')}</Button>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('customer')} />
            <CardBody className="space-y-2 text-xs">
              <Row
                label={t('name')}
                value={
                  <Link
                    href={`/dashboard/contacts/${invoice.contact.id}`}
                    className="underline underline-offset-4"
                  >
                    {invoice.contact.name}
                  </Link>
                }
              />
              <Row label={t('email')} value={invoice.contact.email ?? '—'} />
              <Row label={t('phone')} value={invoice.contact.phone ?? '—'} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('history')} description={t('howThisInvoiceHasMoved')} />
            <CardBody className="space-y-2 text-xs">
              <Row label={t('created')} value={formatDate(invoice.createdAt, true)} />
              <Row label={t('sent')} value={invoice.sentAt ? formatDate(invoice.sentAt, true) : 'Not sent'} />
              <Row label={t('due')} value={invoice.dueAt ? formatDate(invoice.dueAt) : 'No terms set'} />
              <Row
                label={t('paid')}
                value={
                  paid ? (invoice.paidAt ? formatDate(invoice.paidAt, true) : 'Marked as paid') : '—'
                }
              />
              {invoice.externalRef && (
                <Row
                  label={t('providerRef')}
                  value={<span className="font-mono">{invoice.externalRef}</span>}
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Sticky bar so Save stays reachable however long the line-item list gets. */}
      <div className="sticky bottom-0 z-10 mt-4 flex items-center justify-between gap-3 rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] px-4 py-3">
        {paid ? (
          <span className="text-xs muted">A paid invoice cannot be deleted — void it instead.</span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            loading={deleting}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />{t('deleteInvoice')}</Button>
        )}

        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs muted">{t('unsavedChanges')}</span>}
          <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
            <Save className="h-4 w-4" strokeWidth={1.75} />{t('saveChanges')}</Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmVoid}
        onClose={() => setConfirmVoid(false)}
        onConfirm={() => void changeStatus('void', 'Invoice voided.')}
        title={`Void ${invoice.number}?`}
        description={t('voidingKeepsTheRecordFor')}
        confirmLabel={t('voidInvoice')}
        destructive
        loading={statusBusy}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title={`Delete ${invoice.number}?`}
        description={t('theRecordAndItsPay')}
        confirmLabel={t('deleteInvoice')}
        destructive
        loading={deleting}
      />

      {toast.node}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="muted">{label}</span>
      <span className="text-end">{value}</span>
    </div>
  );
}
