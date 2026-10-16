'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, FileText, Plus, Save, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  LoadingBlock,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';

interface SitePage {
  id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
  showInFooter: boolean;
  sortOrder: number;
  updatedAt: string;
}

const BLANK: Omit<SitePage, 'id' | 'updatedAt'> = {
  slug: '',
  title: '',
  content: '',
  isPublished: false,
  showInFooter: true,
  sortOrder: 0,
};

/**
 * Public page editor.
 *
 * A product that takes payments needs a privacy policy, terms and a refund
 * policy — and a buyer should not have to edit React to publish one. Starter
 * drafts are seeded on first load so this opens on something to edit rather
 * than an empty screen.
 */
export function SitePages() {
  const t = useTranslations('sitePages');
  const toast = useToast();
  const [pages, setPages] = useState<SitePage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<SitePage>>(BLANK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SitePage | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/super-admin/pages');
      if (!res.ok) return;
      const data = await res.json();
      setPages(data.pages ?? []);
      if (data.pages?.length && !activeId) {
        setActiveId(data.pages[0].id);
        setDraft(data.pages[0]);
      }
    } finally {
      setLoading(false);
    }
    // activeId is intentionally omitted: re-running on selection would clobber
    // an in-progress edit with the server copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const select = (page: SitePage) => {
    setActiveId(page.id);
    setDraft(page);
  };

  const startNew = () => {
    setActiveId(null);
    setDraft(BLANK);
  };

  const save = async () => {
    if (!draft.title?.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/super-admin/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, id: activeId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not save that page.', 'alert');
        return;
      }
      toast.show(draft.isPublished ? 'Page saved and published.' : 'Draft saved.', 'success');
      setActiveId(data.page.id);
      setDraft(data.page);
      void load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (page: SitePage) => {
    const res = await fetch(`/api/super-admin/pages?id=${page.id}`, { method: 'DELETE' });
    if (!res.ok) return toast.show('Could not delete that page.', 'alert');
    toast.show('Page deleted.', 'success');
    setConfirmDelete(null);
    startNew();
    void load();
  };

  if (loading) return <LoadingBlock label={t('loadingPages')} />;

  return (
    <Card>
      <CardHeader
        title={t('publicPages')}
        description={t('privacyPolicyTermsAndAnything')}
        action={
          <Button size="sm" variant="secondary" onClick={startNew}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />{t('newPage')}</Button>
        }
      />
      <CardBody>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
          {/* Page list */}
          <ul className="space-y-1">
            {pages.map((page) => (
              <li key={page.id}>
                <button
                  type="button"
                  onClick={() => select(page)}
                  className={`flex w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-start text-xs transition-colors duration-150 ease-out ${
                    activeId === page.id
                      ? 'bg-accent/12 font-medium'
                      : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-3.5 w-3.5 shrink-0 muted" strokeWidth={1.75} />
                    <span className="truncate">{page.title}</span>
                  </span>
                  {page.isPublished ? (
                    <Badge tone="success">live</Badge>
                  ) : (
                    <Badge tone="neutral">draft</Badge>
                  )}
                </button>
              </li>
            ))}
            {pages.length === 0 && (
              <li className="rounded-control border border-dashed border-[color:var(--color-border)] px-3 py-6 text-center text-xs muted">{t('noPagesYet')}</li>
            )}
          </ul>

          {/* Editor */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('title')} required>
                <Input
                  value={draft.title ?? ''}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={t('privacyPolicy')}
                />
              </Field>
              <Field label={t('webAddress')} hint="left blank, this follows the title">
                <Input
                  value={draft.slug ?? ''}
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                  placeholder="privacy"
                  className="font-mono text-xs"
                />
              </Field>
            </div>

            <Field
              label={t('content')}
              hint="# heading · **bold** · *italic* · - bullet · [link](https://…)"
            >
              <Textarea
                value={draft.content ?? ''}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                className="min-h-[300px] font-mono text-xs"
                spellCheck={false}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-5 border-t border-[color:var(--color-border)] pt-4">
              <Switch
                checked={Boolean(draft.isPublished)}
                onChange={(v) => setDraft({ ...draft, isPublished: v })}
                label={t('published')}
              />
              <Switch
                checked={draft.showInFooter !== false}
                onChange={(v) => setDraft({ ...draft, showInFooter: v })}
                label={t('showInFooter')}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {activeId && draft.isPublished && draft.slug && (
                  <a
                    href={`/p/${draft.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs muted underline underline-offset-4 transition-colors duration-150 ease-out hover:text-[color:var(--color-fg)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />{t('viewLive')}</a>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const page = pages.find((p) => p.id === activeId);
                      if (page) setConfirmDelete(page);
                    }}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />{t('delete')}</Button>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  loading={saving}
                  disabled={!draft.title?.trim()}
                  onClick={() => void save()}
                >
                  <Save className="h-4 w-4" strokeWidth={1.75} />{t('save')}</Button>
              </div>
            </div>
          </div>
        </div>
      </CardBody>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        title={t('deleteThisPage')}
        description={
          confirmDelete
            ? `“${confirmDelete.title}” will be removed and /p/${confirmDelete.slug} will stop working.`
            : ''
        }
        confirmLabel={t('delete')}
        destructive
      />
      {toast.node}
    </Card>
  );
}
