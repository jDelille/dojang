'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorBlock,
  Field, Input, LoadingBlock, Modal, PageHeader, Select, Spinner, StatusDot, Switch,
  Tabs, Textarea, Td, Th, Tr, Table, useToast,
} from '@/components/ui';
import type { ModelCatalog } from '@/components/agents/types';

export function EmbedSnippet({
  slug,
  appUrl,
  toast,
}: {
  slug: string;
  appUrl: string;
  toast: ReturnType<typeof useToast>;
}) {
  const t = useTranslations('agents');
  const snippet = `<script
  src="${appUrl}/widget.js"
  data-roster-workspace="${slug}"
  data-roster-host="${appUrl}"
  async
></script>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      toast.show('Snippet copied.', 'success');
    } catch {
      toast.show('Could not copy — select the snippet and copy it by hand.', 'alert');
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('websiteChatWidget')}
        description="Paste this before the closing </body> tag on the business's website."
      />
      <CardBody>
        <pre className="scrollbar-thin overflow-x-auto rounded-control border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4 font-mono text-xs leading-relaxed">
          {snippet}
        </pre>
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
            <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />{t('copySnippet')}</Button>
          <p className="text-xs muted">{t('theWidgetUsesYourDefault')}</p>
        </div>
      </CardBody>
    </Card>
  );
}

export function CreateAgentModal({
  open,
  models,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  models: ModelCatalog;
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('agents');
  const [form, setForm] = useState({
    name: '',
    provider: 'claude' as 'claude' | 'openai',
    model: 'claude-opus-5',
    personaPrompt:
      'You answer questions about the business, qualify enquiries and book appointments.',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) return onError('Give the agent a name.');

    setBusy(true);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, channels: ['chat'] }),
      });
      const data = await res.json();
      if (!res.ok) return onError(data.error ?? 'Could not create that agent.');
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
      title={t('newAiAgent')}
      width="sm"
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={busy}
            onClick={() => void submit()}
          >{t('createAgent')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('agentName')} required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('frontDesk')}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('provider')}>
            <Select
              value={form.provider}
              onChange={(e) => {
                const provider = e.target.value as 'claude' | 'openai';
                setForm({ ...form, provider, model: models[provider]?.[0]?.id ?? '' });
              }}
            >
              <option value="claude">{t('claudeAnthropic')}</option>
              <option value="openai">{t('openai')}</option>
            </Select>
          </Field>
          <Field label={t('model')}>
            <Select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
              {(models[form.provider] ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('whatDoesThisAgentDo')} required>
          <Textarea
            value={form.personaPrompt}
            onChange={(e) => setForm({ ...form, personaPrompt: e.target.value })}
            className="min-h-[120px]"
          />
        </Field>
      </div>
    </Modal>
  );
}
