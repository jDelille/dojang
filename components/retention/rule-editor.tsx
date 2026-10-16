'use client';
import { ArrowDown, Plus, Trash2 } from 'lucide-react';
import { ACTION_LABELS, TRIGGER_LABELS, formatDelay, parseSteps, type RetentionStep } from '@/lib/retention-shared';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorBlock,
  Field, Input, LoadingBlock, Modal, PageHeader, Select, Spinner, StatusDot, Switch,
  Table, Tabs, Td, Textarea, Th, Tr, useToast,
} from '@/components/ui';
import { ACTIONS, NETWORK_ERROR } from '@/components/retention/types';
import type { Rule, Stage, StepAction, Template } from '@/components/retention/types';

export function RuleEditor({
  rule,
  templates,
  onClose,
  onSaved,
  onError,
}: {
  rule: Rule | null;
  templates: Template[];
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('retention');
  const [form, setForm] = useState({
    name: rule?.name ?? '',
    description: rule?.description ?? '',
    triggerType: rule?.triggerType ?? 'no_activity',
    days: (rule?.triggerConfig as { days?: number })?.days ?? 14,
    tag: (rule?.triggerConfig as { tag?: string })?.tag ?? '',
    status: (rule?.triggerConfig as { status?: string })?.status ?? 'won',
    steps: (rule?.steps ?? []) as RetentionStep[],
    isActive: rule?.isActive ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [stagesLoaded, setStagesLoaded] = useState(false);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const tagListId = `${useId()}-tags`;

  // Stage keys and tags are matched literally by the engine, so the builder
  // offers the real ones rather than letting a typo save as a live rule.
  useEffect(() => {
    let cancelled = false;

    const loadOptions = async () => {
      try {
        const [stageRes, contactRes] = await Promise.all([
          fetch('/api/pipeline/stages'),
          fetch('/api/contacts?limit=200'),
        ]);

        if (stageRes.ok) {
          const data = await stageRes.json();
          if (!cancelled) {
            setStages((data.stages ?? []) as Stage[]);
            setStagesLoaded(true);
          }
        }

        if (contactRes.ok) {
          const data = await contactRes.json();
          const tags = new Set<string>();
          for (const contact of (data.contacts ?? []) as { tags?: string[] }[]) {
            for (const tag of contact.tags ?? []) tags.add(tag);
          }
          if (!cancelled) setKnownTags([...tags].sort());
        }
      } catch {
        // Suggestions only — every field still accepts what the user types.
      }
    };

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const addStep = () =>
    setForm((f) => ({
      ...f,
      steps: [...f.steps, { action: 'send_email', delayMinutes: 0, subject: '', body: '' }],
    }));

  const updateStep = (index: number, patch: Partial<RetentionStep>) =>
    setForm((f) => ({
      ...f,
      steps: f.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));

  const removeStep = (index: number) =>
    setForm((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== index) }));

  const applyTemplate = (template: Template) =>
    setForm((f) => ({
      ...f,
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      days: (template.triggerConfig as { days?: number }).days ?? f.days,
      steps: template.steps,
    }));

  const submit = async () => {
    if (!form.name.trim()) return onError('Give the rule a name.');
    if (!form.steps.length) return onError('Add at least one step.');
    if (form.triggerType === 'tag_added' && !form.tag.trim()) {
      return onError('Name the tag that should start this rule.');
    }

    const missingTag = form.steps.findIndex(
      (s) => (s.action === 'add_tag' || s.action === 'remove_tag') && !s.tag?.trim(),
    );
    if (missingTag >= 0) return onError(`Step ${missingTag + 1} needs a tag name.`);

    if (stagesLoaded) {
      const unknownStage = form.steps.findIndex(
        (s) => s.action === 'change_stage' && !stages.some((stage) => stage.key === s.stageKey),
      );
      if (unknownStage >= 0) {
        return onError(`Step ${unknownStage + 1} needs a stage from your pipeline.`);
      }
    }

    const triggerConfig: Record<string, unknown> = {};
    if (form.triggerType === 'no_activity') triggerConfig.days = form.days;
    if (form.triggerType === 'tag_added') triggerConfig.tag = form.tag.trim();
    if (form.triggerType === 'lead_status_changed') triggerConfig.status = form.status;

    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      triggerType: form.triggerType,
      triggerConfig,
      steps: form.steps,
      isActive: form.isActive,
    };

    setBusy(true);
    try {
      const res = await fetch(
        rule?.id ? `/api/retention/rules/${rule.id}` : '/api/retention/rules',
        {
          method: rule?.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) return onError(data.error ?? 'Could not save that rule.');
      onSaved();
    } catch {
      onError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      width="lg"
      title={rule?.id ? 'Edit rule' : 'New retention rule'}
      description={t('triggerThenASequenceOf')}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>{t('saveRule')}</Button>
        </>
      }
    >
      <datalist id={tagListId}>
        {knownTags.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>

      <div className="space-y-5">
        {!rule?.id && templates.length > 0 && (
          <div>
            <p className="label-caps mb-2">{t('startFromATemplate')}</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="rounded-pill border border-[color:var(--color-border)] px-3 py-1 text-xs transition-colors duration-150 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label={t('ruleName')} required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('winBackQuietCustomers')}
          />
        </Field>

        <Field label={t('description')}>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('trigger')} required>
            <Select
              value={form.triggerType}
              onChange={(e) => setForm({ ...form, triggerType: e.target.value })}
            >
              {Object.entries(TRIGGER_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          {form.triggerType === 'no_activity' && (
            <Field label={t('daysOfSilence')}>
              <Input
                type="number"
                min={1}
                max={365}
                value={form.days}
                onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
              />
            </Field>
          )}
          {form.triggerType === 'tag_added' && (
            <Field
              label={t('tag')}
              required
              hint={knownTags.length ? 'pick one in use, or type a new one' : undefined}
            >
              <Input
                value={form.tag}
                list={tagListId}
                onChange={(e) => setForm({ ...form, tag: e.target.value })}
                placeholder="vip"
              />
            </Field>
          )}
          {form.triggerType === 'lead_status_changed' && (
            <Field label={t('status')}>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {['new', 'contacted', 'booked', 'won', 'lost'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label-caps">{t('sequence')}</p>
            <Button variant="secondary" size="sm" type="button" onClick={addStep}>
              <Plus className="h-4 w-4" strokeWidth={1.75} />{t('addStep')}</Button>
          </div>

          {form.steps.length === 0 && (
            <p className="rounded-control border border-dashed border-[color:var(--color-border)] px-4 py-6 text-center text-xs muted">{t('noStepsYetAddOne')}</p>
          )}

          <div className="space-y-2">
            {form.steps.map((step, index) => {
              // Keep a step's saved action selectable even if it is no longer offered.
              const actionOptions = ACTIONS.includes(step.action)
                ? ACTIONS
                : [step.action, ...ACTIONS];
              const stageMissing =
                step.action === 'change_stage' &&
                stagesLoaded &&
                !stages.some((stage) => stage.key === step.stageKey);

              return (
                <div key={index}>
                  {index > 0 && (
                    <div className="flex justify-center py-1">
                      <ArrowDown className="h-3.5 w-3.5 muted" strokeWidth={1.75} />
                    </div>
                  )}
                  <div className="rounded-control border border-[color:var(--color-border)] p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_130px_auto]">
                      <Select
                        value={step.action}
                        onChange={(e) => updateStep(index, { action: e.target.value as StepAction })}
                        aria-label={`Step ${index + 1} action`}
                      >
                        {actionOptions.map((action) => (
                          <option key={action} value={action}>
                            {ACTION_LABELS[action]}
                          </option>
                        ))}
                      </Select>

                      <Input
                        type="number"
                        min={0}
                        value={step.delayMinutes ?? 0}
                        onChange={(e) => updateStep(index, { delayMinutes: Number(e.target.value) })}
                        aria-label={`Step ${index + 1} delay in minutes`}
                        placeholder={t('delayMin')}
                      />

                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        aria-label={`Remove step ${index + 1}`}
                        className="rounded-control p-1.5 muted transition-colors hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>

                    {(step.action === 'send_email' ||
                      step.action === 'request_review' ||
                      step.action === 'notify_team' ||
                      step.action === 'create_task') && (
                      <Input
                        value={step.subject ?? ''}
                        onChange={(e) => updateStep(index, { subject: e.target.value })}
                        aria-label={`Step ${index + 1} subject or title`}
                        placeholder={t('subjectTitle')}
                        className="mt-2"
                      />
                    )}

                    {[
                      'send_email',
                      'send_sms',
                      'send_push',
                      'notify_team',
                      'request_review',
                    ].includes(step.action) && (
                      <Textarea
                        value={step.body ?? ''}
                        onChange={(e) => updateStep(index, { body: e.target.value })}
                        aria-label={`Step ${index + 1} message`}
                        placeholder="Message — use {{first_name}}, {{business}}, {{phone}}…"
                        className="mt-2 min-h-[80px]"
                      />
                    )}

                    {(step.action === 'add_tag' || step.action === 'remove_tag') && (
                      <Input
                        value={step.tag ?? ''}
                        list={tagListId}
                        onChange={(e) => updateStep(index, { tag: e.target.value })}
                        aria-label={`Step ${index + 1} tag name`}
                        placeholder={t('tagName')}
                        className="mt-2"
                      />
                    )}

                    {step.action === 'change_stage' &&
                      (stagesLoaded ? (
                        <Select
                          value={step.stageKey ?? ''}
                          onChange={(e) => updateStep(index, { stageKey: e.target.value })}
                          aria-label={`Step ${index + 1} pipeline stage`}
                          aria-invalid={stageMissing || undefined}
                          className="mt-2"
                        >
                          <option value="">{t('chooseAStage')}</option>
                          {stages.map((stage) => (
                            <option key={stage.id} value={stage.key}>
                              {stage.name}
                            </option>
                          ))}
                          {step.stageKey && !stages.some((s) => s.key === step.stageKey) && (
                            <option value={step.stageKey}>
                              {step.stageKey} — no longer in your pipeline
                            </option>
                          )}
                        </Select>
                      ) : (
                        <Input
                          value={step.stageKey ?? ''}
                          onChange={(e) => updateStep(index, { stageKey: e.target.value })}
                          aria-label={`Step ${index + 1} pipeline stage key`}
                          placeholder={t('stageKeyEGContacted')}
                          className="mt-2"
                        />
                      ))}

                    {stageMissing && (
                      <p className="mt-1.5 text-xs text-alert">{t('pickAStageFromYour')}</p>
                    )}

                    <div className="mt-3 border-t border-[color:var(--color-border)] pt-3">
                      <Switch
                        checked={step.skipIfReplied ?? false}
                        onChange={(v) => updateStep(index, { skipIfReplied: v })}
                        label={t('skipTheRestIfThey')}
                        description={t('stopsTheSequenceAsSoon')}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-control border border-[color:var(--color-border)] p-3">
          <Switch
            checked={form.isActive}
            onChange={(v) => setForm({ ...form, isActive: v })}
            label={t('switchThisRuleOn')}
            description={t('liveRulesScanForMatching')}
          />
        </div>
      </div>
    </Modal>
  );
}
