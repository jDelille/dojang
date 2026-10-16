'use client';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHANNELS, TONES, fingerprint } from '@/components/agents/types';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorBlock,
  Field, Input, LoadingBlock, Modal, PageHeader, Select, Spinner, StatusDot, Switch,
  Tabs, Textarea, Td, Th, Tr, Table, useToast,
} from '@/components/ui';
import type { Agent, ModelCatalog } from '@/components/agents/types';

export function AgentConfig({
  agent,
  models,
  onSaved,
  onDeleted,
  onDirtyChange,
  onError,
}: {
  agent: Agent;
  models: ModelCatalog;
  onSaved: (agent: Agent) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('agents');
  const [form, setForm] = useState(agent);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => setForm(agent), [agent]);

  const dirty = fingerprint(form) !== fingerprint(agent);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    if (!form.name.trim() || !form.personaPrompt.trim()) {
      return onError('A name and a persona are required.');
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          provider: form.provider,
          model: form.model,
          personaPrompt: form.personaPrompt,
          greeting: form.greeting,
          tone: form.tone,
          channels: form.channels,
          maxTokens: form.maxTokens,
          isActive: form.isActive,
          isDefault: form.isDefault,
          escalationRules: form.escalationRules ?? {},
        }),
      });
      const data = await res.json();
      if (!res.ok) return onError(data.error ?? 'Could not save the agent.');
      onSaved(data.agent);
    } catch {
      onError('Could not reach the server. Your changes are still here — try saving again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return onError(data.error ?? 'Could not delete that agent.');
      }
      setConfirmDelete(false);
      onDeleted();
    } catch {
      onError('Could not reach the server.');
    } finally {
      setDeleting(false);
    }
  };

  const providerModels = models[form.provider] ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('identity')} description={t('howTheAgentIntroducesItself')} />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('agentName')} required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t('tone')}>
              <Select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={t('greeting')} hint="first thing a customer sees or hears">
            <Input
              value={form.greeting ?? ''}
              onChange={(e) => setForm({ ...form, greeting: e.target.value })}
              placeholder={t('hiHowCanIHelp')}
            />
          </Field>

          <Field
            label={t('personaAndInstructions')}
            required
            hint="what this agent does and what it must not do"
          >
            <Textarea
              value={form.personaPrompt}
              onChange={(e) => setForm({ ...form, personaPrompt: e.target.value })}
              className="min-h-[160px] font-mono text-xs"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('model')}
          description={t('eachAgentCanRunOn')}
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('provider')}>
              <Select
                value={form.provider}
                onChange={(e) => {
                  const provider = e.target.value as 'claude' | 'openai';
                  setForm({
                    ...form,
                    provider,
                    model: models[provider]?.[0]?.id ?? form.model,
                  });
                }}
              >
                <option value="claude">{t('claudeAnthropic')}</option>
                <option value="openai">{t('openai')}</option>
              </Select>
            </Field>
            <Field label={t('model')}>
              <Select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                {providerModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.note ? ` — ${m.note}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t('maxReplyLengthTokens')} hint="keep it short for SMS and voice">
            <Input
              type="number"
              min={128}
              max={8192}
              value={form.maxTokens}
              onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) })}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('channels')} description={t('whereThisAgentRepliesAutomatically')} />
        <CardBody>
          <div
            role="group"
            aria-label={t('channelsThisAgentRepliesOn')}
            className="flex flex-wrap gap-2"
          >
            {CHANNELS.map((channel) => {
              const on = form.channels.includes(channel);
              return (
                <button
                  key={channel}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setForm({
                      ...form,
                      channels: on
                        ? form.channels.filter((c) => c !== channel)
                        : [...form.channels, channel],
                    })
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-xs transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    on
                      ? 'border-accent bg-accent/12 font-medium'
                      : 'border-[color:var(--color-border)] muted hover:text-[color:var(--color-fg)]',
                  )}
                >
                  {on && <Check className="h-3 w-3" strokeWidth={1.75} aria-hidden />}
                  {channel}
                </button>
              );
            })}
          </div>
          {!form.channels.length && (
            <p className="mt-3 text-xs muted">{t('withNoChannelsSelectedThis')}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('escalation')}
          description={t('whenToStopAndHand')}
        />
        <CardBody className="space-y-4">
          <Field label={t('handOffOnTheseWords')} hint="comma separated">
            <Input
              value={(form.escalationRules?.keywords ?? []).join(', ')}
              onChange={(e) =>
                setForm({
                  ...form,
                  escalationRules: {
                    ...form.escalationRules,
                    keywords: e.target.value
                      .split(',')
                      .map((k) => k.trim())
                      .filter(Boolean),
                  },
                })
              }
              placeholder="refund, complaint, lawyer, speak to a human"
            />
          </Field>
          <Field label={t('handOffAfterThisMany')} hint="0 to disable">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.escalationRules?.afterTurns ?? 0}
              onChange={(e) =>
                setForm({
                  ...form,
                  escalationRules: {
                    ...form.escalationRules,
                    afterTurns: Number(e.target.value),
                  },
                })
              }
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <Switch
            checked={form.isActive}
            onChange={(v) => setForm({ ...form, isActive: v })}
            label={t('agentIsLive')}
            description={t('whenOffTheAgentStops')}
          />
          <Switch
            checked={form.isDefault}
            onChange={(v) => setForm({ ...form, isDefault: v })}
            label={t('defaultAgent')}
            description={t('handlesTheWebsiteWidgetAnd')}
          />
        </CardBody>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />{t('deleteAgent')}</Button>
        {!dirty && <p className="text-xs muted">{t('allChangesSaved')}</p>}
      </div>

      {dirty && (
        <div
          role="status"
          className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent/40 bg-[color:var(--color-elevated)] px-4 py-3"
        >
          <p className="text-xs">Unsaved changes to {agent.name}.</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setForm(agent)}>{t('discard')}</Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => void save()}
            >{t('saveChanges')}</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title={`Delete "${agent.name}"?`}
        description={t('itsConversationsStayInThe')}
        confirmLabel={t('deleteAgent')}
        destructive
        loading={deleting}
      />
    </div>
  );
}
