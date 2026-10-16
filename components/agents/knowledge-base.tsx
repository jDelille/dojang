'use client';
import { DOC_KINDS } from '@/components/agents/types';
import { cn } from '@/lib/utils';
import { estimateTokens } from '@/components/agents/types';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorBlock,
  Field, Input, LoadingBlock, Modal, PageHeader, Select, Spinner, StatusDot, Switch,
  Tabs, Textarea, Td, Th, Tr, Table, useToast,
} from '@/components/ui';
import type { DocKind, KnowledgeDoc } from '@/components/agents/types';

export function KnowledgeBase({
  agentId,
  onSaved,
  onError,
}: {
  agentId: string;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('agents');
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeDoc | null>(null);
  const [form, setForm] = useState<{ title: string; kind: DocKind; content: string }>({
    title: '',
    kind: 'doc',
    content: '',
  });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/agents/knowledge?agentId=${agentId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not load the knowledge base.');
        return;
      }
      setDocs(data.docs ?? []);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: '', kind: 'doc', content: '' });
    setEditorOpen(true);
  };

  const openExisting = (doc: KnowledgeDoc) => {
    setEditing(doc);
    setForm({
      title: doc.title,
      kind: (DOC_KINDS as string[]).includes(doc.kind) ? (doc.kind as DocKind) : 'doc',
      content: doc.content,
    });
    setEditorOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      return onError('A title and some content are required.');
    }

    // The knowledge API has no update route yet, so an edit is saved as a new
    // document and the original is removed only once the replacement exists.
    const scopeAgentId = editing ? editing.agentId : agentId;

    setBusy(true);
    try {
      const res = await fetch('/api/agents/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          kind: form.kind,
          content: form.content,
          ...(scopeAgentId ? { agentId: scopeAgentId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) return onError(data.error ?? 'Could not save that document.');

      if (editing) {
        const removed = await fetch(`/api/agents/knowledge?id=${editing.id}`, { method: 'DELETE' });
        if (!removed.ok) {
          onError('Saved, but the previous version is still listed. Delete it by hand.');
        }
      }

      setEditorOpen(false);
      setEditing(null);
      setForm({ title: '', kind: 'doc', content: '' });
      onSaved(editing ? 'Document updated.' : 'Document added.');
      await load();
    } catch {
      onError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/knowledge?id=${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return onError(data.error ?? 'Could not delete that document.');
      }
      setDeleteTarget(null);
      onSaved('Document deleted.');
      await load();
    } catch {
      onError('Could not reach the server.');
    } finally {
      setDeleting(false);
    }
  };

  const totalTokens = docs.reduce((sum, d) => sum + d.tokens, 0);
  const draftTokens = estimateTokens(form.content);

  return (
    <>
      <Card>
        <CardHeader
          title={t('knowledgeBase')}
          description={
            loading
              ? 'Everything this agent answers from.'
              : `${docs.length} document${docs.length === 1 ? '' : 's'} · ~${totalTokens.toLocaleString()} tokens in every prompt`
          }
          action={
            <Button type="button" variant="secondary" size="sm" onClick={openNew}>
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Add
            </Button>
          }
        />
        {error ? (
          <ErrorBlock message={error} onRetry={() => void load()} />
        ) : loading ? (
          <LoadingBlock label={t('loadingDocuments')} />
        ) : docs.length ? (
          <ul className="divide-y divide-[color:var(--color-border)]">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => openExisting(doc)}
                  className={cn(
                    'min-w-0 flex-1 px-5 py-3 text-start transition-colors duration-150',
                    'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <Badge>{doc.kind}</Badge>
                    {!doc.agentId && <Badge tone="info">all agents</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs muted">{doc.content.slice(0, 300)}</p>
                  <p className="mt-1 text-[11px] muted">
                    ~{doc.tokens.toLocaleString()} tokens · open to read or edit
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(doc)}
                  aria-label={`Delete ${doc.title}`}
                  className={cn(
                    'me-3 mt-3 shrink-0 rounded-control p-1.5 muted transition-colors hover:text-alert',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  )}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<BookOpen strokeWidth={1.75} />}
            title={t('noDocumentsYet')}
            description={t('addFaqsServiceListsPricing')}
            action={
              <Button type="button" variant="primary" size="sm" onClick={openNew}>{t('addADocument')}</Button>
            }
          />
        )}
      </Card>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? 'Edit knowledge' : 'Add knowledge'}
        description={
          editing
            ? 'The agent answers from this text word for word.'
            : 'Anything the agent should be able to answer from.'
        }
        footer={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>{t('cancel')}</Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => void submit()}
            >
              {editing ? 'Save changes' : 'Save document'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
            <Field label={t('title')} required>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t('servicesAndPricing')}
              />
            </Field>
            <Field label={t('type')}>
              <Select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as DocKind })}
              >
                <option value="doc">{t('document')}</option>
                <option value="faq">FAQ</option>
                <option value="pricing">{t('pricing')}</option>
                <option value="policy">{t('policy')}</option>
              </Select>
            </Field>
          </div>
          <Field label={t('content')} required>
            <Textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="min-h-[220px]"
              placeholder={'Q: Do you offer emergency callouts?\nA: Yes, 24/7 within 30 miles. Callout fee is $95.'}
            />
          </Field>
          <p className="text-xs muted">
            ~{draftTokens.toLocaleString()} tokens
            {editing ? ` · was ~${editing.tokens.toLocaleString()}` : ''} · sent with every message
            this agent answers.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
        title={deleteTarget ? `Delete "${deleteTarget.title}"?` : 'Delete document?'}
        description={t('theAgentStopsAnsweringFrom')}
        confirmLabel={t('deleteDocument')}
        destructive
        loading={deleting}
      />
    </>
  );
}
