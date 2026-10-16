'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, GripVertical, KanbanSquare, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  useToast,
} from '@/components/ui';
import Link from 'next/link';
import { cn, formatCurrency, relativeTime } from '@/lib/utils';

type Stage = { id: string; name: string; key: string; order: number; color: string | null };

type Deal = {
  id: string;
  title: string;
  value: number;
  currency: string;
  stageId: string;
  status: string;
  createdAt: string;
  contact: { id: string; name: string; company: string | null } | null;
};

/**
 * Kanban CRM view (spec §4.4). Drag-and-drop uses the native HTML5 DnD API —
 * no extra dependency, and it degrades to a stage dropdown on touch devices.
 */
export function PipelineBoard() {
  const t = useTranslations('pipeline');
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pipeline/deals');
      const data = await res.json();
      if (res.ok) {
        setStages(data.stages ?? []);
        setDeals(data.deals ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const moveDeal = async (dealId: string, stageId: string) => {
    const previous = deals;
    // Optimistic — the board should feel instant.
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stageId } : d)));

    const res = await fetch(`/api/pipeline/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId }),
    });

    if (!res.ok) {
      setDeals(previous);
      toast.show('Could not move that deal.', 'alert');
    }
  };

  const totalByStage = (stageId: string) =>
    deals.filter((d) => d.stageId === stageId).reduce((sum, d) => sum + d.value, 0);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin muted" strokeWidth={1.75} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={t('pipeline')}
        description={`${deals.length} deal${deals.length === 1 ? '' : 's'} across ${stages.length} stages`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setNewDealOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />{t('newDeal')}</Button>
        }
      />

      {stages.length === 0 ? (
        <Card>
          <EmptyState icon={<KanbanSquare strokeWidth={1.75} />} title={t('noPipelineStages')} description={t('reloadToSeedTheDefault')} />
        </Card>
      ) : (
        <div className="scrollbar-thin relative -mx-1 flex gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageDeals = deals.filter((d) => d.stageId === stage.id);
            const isOver = overStage === stage.id;

            return (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(stage.id);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverStage(null);
                  if (dragging) void moveDeal(dragging, stage.id);
                  setDragging(null);
                }}
                className={cn(
                  'flex w-72 shrink-0 flex-col rounded-card border bg-[color:var(--color-elevated)] transition-colors duration-150',
                  isOver ? 'border-accent' : 'border-[color:var(--color-border)]',
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-[color:var(--color-border)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-pill"
                      style={{ background: stage.color ?? 'var(--color-slate)' }}
                      aria-hidden
                    />
                    <span className="text-sm font-medium">{stage.name}</span>
                    <span className="text-xs muted">{stageDeals.length}</span>
                  </div>
                  {totalByStage(stage.id) > 0 && (
                    <span className="text-xs tabular-nums muted">
                      {formatCurrency(totalByStage(stage.id), stageDeals[0]?.currency ?? 'USD')}
                    </span>
                  )}
                </div>

                <div
                  role="list"
                  aria-label={`${stage.name} deals`}
                  className="scrollbar-thin min-h-[120px] flex-1 space-y-2 overflow-y-auto p-2"
                >
                  {stageDeals.map((deal) => (
                    <article
                      key={deal.id}
                      draggable
                      tabIndex={0}
                      role="listitem"
                      aria-label={`${deal.title}, ${stage.name}. Left and right arrows move it between stages, Enter opens it.`}
                      onDragStart={() => setDragging(deal.id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOverStage(null);
                      }}
                      onKeyDown={(e) => {
                        // Drag-and-drop is mouse-only, so the board needs a real
                        // keyboard path rather than a touch-only fallback.
                        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                          e.preventDefault();
                          const index = stages.findIndex((st) => st.id === deal.stageId);
                          const target = stages[index + (e.key === 'ArrowRight' ? 1 : -1)];
                          if (target) void moveDeal(deal.id, target.id);
                        }
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setEditing(deal);
                        }
                      }}
                      onDoubleClick={() => setEditing(deal)}
                      className={cn(
                        'group cursor-grab rounded-control border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 transition-opacity active:cursor-grabbing',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        dragging === deal.id && 'opacity-50',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">{deal.title}</p>
                        <GripVertical
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity muted group-hover:opacity-100"
                          strokeWidth={1.75}
                        />
                      </div>
                      {deal.contact && (
                        <p className="mt-1 truncate text-xs muted">
                          {deal.contact.name}
                          {/* Business leads often have company === name; don't repeat it. */}
                          {deal.contact.company && deal.contact.company !== deal.contact.name
                            ? ` · ${deal.contact.company}`
                            : ''}
                        </p>
                      )}
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium tabular-nums">
                          {formatCurrency(deal.value, deal.currency)}
                        </span>
                        <span className="text-[11px] muted">{relativeTime(deal.createdAt)}</span>
                      </div>

                      {/* Touch fallback — drag isn't available on most tablets. */}
                      <Select
                        aria-label={`Move ${deal.title} to another stage`}
                        value={deal.stageId}
                        onChange={(e) => void moveDeal(deal.id, e.target.value)}
                        className="mt-2 h-7 text-[11px]"
                      >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </article>
                  ))}

                  {!stageDeals.length && (
                    <p className="px-2 py-6 text-center text-xs muted">{t('dropADealHere')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditDealModal
          deal={editing}
          stages={stages}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.show('Deal updated.', 'success');
            void load();
          }}
          onDeleted={() => {
            setEditing(null);
            toast.show('Deal deleted.', 'success');
            void load();
          }}
          onError={(m) => toast.show(m, 'alert')}
        />
      )}

      <NewDealModal
        open={newDealOpen}
        stages={stages}
        onClose={() => setNewDealOpen(false)}
        onCreated={() => {
          setNewDealOpen(false);
          toast.show('Deal created.', 'success');
          void load();
        }}
        onError={(m) => toast.show(m, 'alert')}
      />

      {toast.node}
    </>
  );
}

function NewDealModal({
  open,
  stages,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  stages: Stage[];
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('pipeline');
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ contactId: '', title: '', value: 0, stageId: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void fetch('/api/contacts?limit=200')
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts ?? []))
      .catch(() => undefined);
  }, [open]);

  const submit = async () => {
    if (!form.contactId) return onError('Pick a contact for this deal.');
    if (!form.title.trim()) return onError('Give the deal a title.');

    setBusy(true);
    try {
      const res = await fetch('/api/pipeline/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: form.contactId,
          title: form.title.trim(),
          value: Number(form.value) || 0,
          stageId: form.stageId || stages[0]?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) return onError(data.error ?? 'Could not create that deal.');
      setForm({ contactId: '', title: '', value: 0, stageId: '' });
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('newDeal')}
      width="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>{t('createDeal')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('contact')} required>
          {contacts.length ? (
            <Select
              value={form.contactId}
              onChange={(e) => setForm({ ...form, contactId: e.target.value })}
            >
              <option value="">{t('selectAContact')}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-xs muted">
              No contacts yet. Convert a lead first — moving one past &ldquo;new&rdquo; creates its
              contact record.
            </p>
          )}
        </Field>
        <Field label={t('dealTitle')} required>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t('annualMaintenanceContract')}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('value')}>
            <Input
              type="number"
              min={0}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('stage')}>
            <Select
              value={form.stageId}
              onChange={(e) => setForm({ ...form, stageId: e.target.value })}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}


function EditDealModal({
  deal,
  stages,
  onClose,
  onSaved,
  onDeleted,
  onError,
}: {
  deal: Deal;
  stages: Stage[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('pipeline');
  const [form, setForm] = useState({
    title: deal.title,
    value: deal.value,
    stageId: deal.stageId,
  });
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const save = async () => {
    if (!form.title.trim()) return onError('Give the deal a title.');

    setBusy(true);
    try {
      const res = await fetch(`/api/pipeline/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          value: Number(form.value) || 0,
          stageId: form.stageId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return onError(data.error ?? 'Could not save this deal.');
      onSaved();
    } catch {
      onError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/pipeline/deals/${deal.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return onError(data.error ?? 'Could not delete this deal.');
      }
      onDeleted();
    } catch {
      onError('Could not reach the server.');
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={t('editDeal')}
        width="sm"
        onSubmit={() => void save()}
        footer={
          <>
            <Button variant="ghost" size="sm" type="button" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />{t('delete')}</Button>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>{t('cancel')}</Button>
            <Button variant="primary" size="sm" type="submit" loading={busy}>{t('save')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('dealTitle')} required>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('value')}>
              <Input
                type="number"
                min={0}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('stage')}>
              <Select
                value={form.stageId}
                onChange={(e) => setForm({ ...form, stageId: e.target.value })}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {deal.contact && (
            <Link
              href={`/dashboard/contacts/${deal.contact.id}`}
              className="inline-flex items-center gap-1.5 text-xs underline underline-offset-4 muted hover:text-[color:var(--color-fg)]"
            >
              Open {deal.contact.name}
              <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
            </Link>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void remove()}
        title={t('deleteThisDeal')}
        description={`"${deal.title}" will be removed from the pipeline.`}
        confirmLabel={t('deleteDeal')}
        destructive
        loading={busy}
      />
    </>
  );
}
