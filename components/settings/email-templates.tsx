'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, RotateCcw, Save, Send } from 'lucide-react';
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
  Tabs,
  Textarea,
  useToast,
} from '@/components/ui';

interface Override {
  kind: string;
  subject: string | null;
  html: string;
  isActive: boolean;
  updatedAt: string;
}

interface TemplateMeta {
  kind: string;
  label: string;
  description: string;
  variables: string[];
  override: Override | null;
}

/**
 * Email template editor.
 *
 * Preview is a sandboxed iframe rather than dangerouslySetInnerHTML: the
 * template is the buyer's own markup, but rendering arbitrary HTML directly
 * into the dashboard would let a pasted snippet reach the session it is
 * previewed in.
 */
export function EmailTemplates({ defaultTestTo }: { defaultTestTo?: string }) {
  const t = useTranslations('emailTemplates');
  const toast = useToast();
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [active, setActive] = useState('shell');
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ subject: string; html: string }>({ subject: '', html: '' });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testTo, setTestTo] = useState(defaultTestTo ?? '');
  const [confirmRevert, setConfirmRevert] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/email-templates');
      if (!res.ok) return;
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(() => templates.find((t) => t.kind === active), [templates, active]);

  // Reset the draft whenever the selected template changes.
  useEffect(() => {
    setDraft({
      subject: current?.override?.subject ?? '',
      html: current?.override?.html ?? '',
    });
  }, [current]);

  const save = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: current.kind, subject: draft.subject || null, html: draft.html }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not save that template.', 'alert');
        return;
      }
      toast.show('Template saved.', 'success');
      void load();
    } finally {
      setSaving(false);
    }
  };

  const revert = async () => {
    if (!current) return;
    const res = await fetch(`/api/settings/email-templates?kind=${current.kind}`, { method: 'DELETE' });
    if (!res.ok) return toast.show('Could not revert that template.', 'alert');
    toast.show('Reverted to the built-in design.', 'success');
    setConfirmRevert(false);
    setDraft({ subject: '', html: '' });
    void load();
  };

  const sendTest = async () => {
    if (!current || !testTo.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/settings/email-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: current.kind, html: draft.html, subject: draft.subject || null, to: testTo.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not send the test.', 'alert');
        return;
      }
      toast.show(`Test sent to ${testTo.trim()}.`, 'success');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <LoadingBlock label={t('loadingTemplates')} />;

  return (
    <Card>
      <CardHeader
        title={t('emailTemplates')}
        description={t('restyleTheEmailsRosterSends')}
      />
      <CardBody className="space-y-4">
        <Tabs
          tabs={templates.map((t) => ({ key: t.kind, label: t.label }))}
          active={active}
          onChange={setActive}
        />

        {current && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs muted">{current.description}</p>
              {current.override ? (
                <Badge tone="accent">customized</Badge>
              ) : (
                <Badge tone="neutral">built-in</Badge>
              )}
            </div>

            <div className="rounded-control border border-[color:var(--color-border)] px-3 py-2">
              <p className="label-caps mb-1.5">{t('availableVariables')}</p>
              <div className="flex flex-wrap gap-1.5">
                {current.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, html: `${d.html}{{${v}}}` }))}
                    className="rounded-control border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-2xs transition-colors duration-150 ease-out hover:border-accent hover:text-accent-dark"
                  >
                    {'{{'}{v}{'}}'}
                  </button>
                ))}
              </div>
            </div>

            {current.kind !== 'shell' && (
              <Field label={t('subject')} hint="leave blank to keep the default">
                <Input
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  placeholder="Invoice {{invoice_number}} from {{business}}"
                />
              </Field>
            )}

            <Field
              label={t('html')}
              hint={current.kind === 'shell' ? 'must include {{content}}' : 'leave blank for the built-in design'}
            >
              <Textarea
                value={draft.html}
                onChange={(e) => setDraft({ ...draft, html: e.target.value })}
                className="min-h-[220px] font-mono text-xs"
                spellCheck={false}
                placeholder={
                  current.kind === 'shell'
                    ? '<div style="font-family:Helvetica,Arial,sans-serif">\n  <h1>{{business}}</h1>\n  {{content}}\n  <p>© {{year}} {{business}}</p>\n</div>'
                    : '<p>Hi {{first_name}},</p>\n<p>…</p>'
                }
              />
            </Field>

            {draft.html.trim() && (
              <div>
                <p className="label-caps mb-1.5">{t('preview')}</p>
                <iframe
                  title={t('emailPreview')}
                  sandbox=""
                  className="h-72 w-full rounded-control border border-[color:var(--color-border)] bg-white"
                  srcDoc={draft.html
                    .replace(/\{\{\s*content\s*\}\}/g, '<p style="font-family:Helvetica,Arial,sans-serif">Your message body appears here.</p>')
                    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => `<span style="background:#FDF3E3">${k}</span>`)}
                />
                <p className="mt-1 text-2xs muted">
                  Variables are highlighted. Email clients strip much of modern CSS — inline styles
                  and tables are the reliable route.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[color:var(--color-border)] pt-4">
              <div className="flex min-w-0 flex-1 items-end gap-2">
                <div className="min-w-0 flex-1 sm:max-w-xs">
                  <Field label={t('sendATestTo')}>
                    <Input
                      type="email"
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </Field>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={sending}
                  disabled={!testTo.trim() || !draft.html.trim()}
                  onClick={() => void sendTest()}
                >
                  <Send className="h-4 w-4" strokeWidth={1.75} />{t('sendTest')}</Button>
              </div>

              <div className="flex items-center gap-2">
                {current.override && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRevert(true)}>
                    <RotateCcw className="h-4 w-4" strokeWidth={1.75} />{t('revert')}</Button>
                )}
                <Button size="sm" variant="primary" loading={saving} onClick={() => void save()}>
                  <Save className="h-4 w-4" strokeWidth={1.75} />{t('save')}</Button>
              </div>
            </div>
          </>
        )}

        <p className="flex items-start gap-2 text-2xs muted">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />{t('testSendsGoThroughYour')}</p>
      </CardBody>

      <ConfirmDialog
        open={confirmRevert}
        onClose={() => setConfirmRevert(false)}
        onConfirm={() => void revert()}
        title={t('revertThisTemplate')}
        description={t('yourCustomizedHtmlWillBe')}
        confirmLabel={t('revert')}
        destructive
      />
      {toast.node}
    </Card>
  );
}
