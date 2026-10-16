'use client';
import { RuleEditor } from '@/components/retention/rule-editor';
import { RuleRuns } from '@/components/retention/rule-runs';
import { NETWORK_ERROR, RUN_LABELS, RUN_TONES } from '@/components/retention/types';
import type { Rule, Run, RunFilter, RunStatus, Stage, Template } from '@/components/retention/types';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowDown,
  FlaskConical,
  Plus,
  Repeat,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Switch,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  Tr,
  useToast,
} from '@/components/ui';
import {
  ACTION_LABELS,
  TRIGGER_LABELS,
  formatDelay,
  parseSteps,
  type RetentionStep,
} from '@/lib/retention-shared';
import { formatDate, relativeTime } from '@/lib/utils';













/** Rule builder: trigger → condition → action sequence (spec §4.3). */
export function RetentionClient() {
  const t = useTranslations('retention');
  const [rules, setRules] = useState<Rule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [failures, setFailures] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [inspecting, setInspecting] = useState<{ rule: Rule; filter: RunFilter } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<null | {
    rule: string;
    matchedContacts: number;
    usingPlaceholder: boolean;
    preview: { index: number; runsAfter: string; summary: string; detail?: string }[];
  }>(null);
  const toast = useToast();

  /**
   * Failed-run counts per rule live on the analytics summary, which needs a
   * different permission — a refusal there just hides the badge.
   */
  const loadFailures = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics/summary?days=365');
      if (!res.ok) return;
      const data = await res.json();
      const counts: Record<string, number> = {};
      for (const row of (data.retention ?? []) as { id: string; failed: number }[]) {
        counts[row.id] = row.failed;
      }
      setFailures(counts);
    } catch {
      // Supplementary detail only; the list is still usable without it.
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/retention/rules');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not load your automations.');
        return;
      }
      setRules(data.rules ?? []);
      setTemplates(data.templates ?? []);
      void loadFailures();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }, [loadFailures]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (rule: Rule) => {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r)));

    try {
      const res = await fetch(`/api/retention/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.show(data.error ?? 'Could not change that rule.', 'alert');
        void load();
        return;
      }
      toast.show(rule.isActive ? 'Rule paused.' : 'Rule is live.', 'success');
    } catch {
      toast.show(NETWORK_ERROR, 'alert');
      void load();
    }
  };

  const runTest = async (rule: Rule) => {
    setTestingId(rule.id);
    try {
      const res = await fetch(`/api/retention/rules/${rule.id}/test`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not run the test.', 'alert');
        return;
      }
      setTestResult({ ...data, rule: rule.name });
    } catch {
      toast.show(NETWORK_ERROR, 'alert');
    } finally {
      setTestingId(null);
    }
  };

  const remove = async () => {
    const rule = pendingDelete;
    if (!rule) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/retention/rules/${rule.id}`, { method: 'DELETE' });
      if (!res.ok) {
        // A staff user without retention:write gets a 403 here — say so rather
        // than claiming success and letting the rule reappear on the refetch.
        const data = await res.json().catch(() => ({}));
        toast.show(data.error ?? 'Could not delete that rule.', 'alert');
        return;
      }
      setPendingDelete(null);
      toast.show('Rule deleted.', 'success');
      void load();
    } catch {
      toast.show(NETWORK_ERROR, 'alert');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <LoadingBlock label={t('loadingAutomations')} />;

  if (error) {
    return (
      <Card>
        <ErrorBlock message={error} onRetry={() => void load()} />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title={t('retention')}
        description={t('automationsThatKeepCustomersComing')}
        actions={
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />{t('newRule')}</Button>
        }
      />

      {rules.length ? (
        <div className="space-y-3">
          {rules.map((rule) => {
            const failed = failures[rule.id] ?? 0;

            return (
              <Card key={rule.id}>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-sm font-semibold">{rule.name}</h3>
                        <Badge tone={rule.isActive ? 'success' : 'neutral'}>
                          {rule.isActive ? 'Live' : 'Paused'}
                        </Badge>
                        {failed > 0 && (
                          <button
                            type="button"
                            onClick={() => setInspecting({ rule, filter: 'failed' })}
                            aria-label={`Show the ${failed} failed run${failed === 1 ? '' : 's'} for ${rule.name}`}
                            className="rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            <Badge tone="alert">
                              <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
                              {failed} failed
                            </Badge>
                          </button>
                        )}
                      </div>
                      {rule.description && <p className="mt-1 text-xs muted">{rule.description}</p>}
                      <p className="mt-2 text-xs muted">
                        <Zap className="me-1 inline h-3 w-3" strokeWidth={1.75} />
                        {TRIGGER_LABELS[rule.triggerType] ?? rule.triggerType}
                        {rule.triggerType === 'no_activity' &&
                          ` (${(rule.triggerConfig as { days?: number }).days ?? 14} days)`}
                        {' · '}
                        <button
                          type="button"
                          onClick={() => setInspecting({ rule, filter: 'all' })}
                          aria-label={`Show the contacts enrolled in ${rule.name}`}
                          className="rounded-control underline underline-offset-2 transition-colors hover:text-[color:var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {rule._count.runs} enrolled · {rule.completedRuns} completed
                        </button>
                        {rule.lastRunAt ? ` · last scan ${relativeTime(rule.lastRunAt)}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={testingId === rule.id}
                        onClick={() => void runTest(rule)}
                      >
                        {testingId === rule.id ? null : (
                          <FlaskConical className="h-4 w-4" strokeWidth={1.75} />
                        )}
                        Dry run
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditing(rule)}>{t('edit')}</Button>
                      <Switch
                        checked={rule.isActive}
                        onChange={() => void toggleActive(rule)}
                        label={rule.isActive ? 'Pause' : 'Activate'}
                      />
                      <button
                        type="button"
                        onClick={() => setPendingDelete(rule)}
                        aria-label={`Delete ${rule.name}`}
                        className="rounded-control p-1.5 muted transition-colors hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>

                  <ol className="mt-4 space-y-1.5 border-t border-[color:var(--color-border)] pt-4">
                    {rule.steps.map((step, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border border-[color:var(--color-border)] text-[10px] tabular-nums">
                          {i + 1}
                        </span>
                        <span className="font-medium">{ACTION_LABELS[step.action]}</span>
                        {step.delayMinutes ? (
                          <span className="muted">after {formatDelay(step.delayMinutes)}</span>
                        ) : (
                          <span className="muted">immediately</span>
                        )}
                        {step.subject && <span className="truncate muted">— {step.subject}</span>}
                        {step.skipIfReplied && <Badge>skip if replied</Badge>}
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Repeat strokeWidth={1.75} />}
            title={t('noAutomationsYet')}
            description={t('startFromATemplateYou')}
          />
          <div className="grid grid-cols-1 gap-3 border-t border-[color:var(--color-border)] p-5 sm:grid-cols-2">
            {templates.map((template) => (
              <button
                key={template.name}
                type="button"
                onClick={() =>
                  setEditing({
                    ...template,
                    id: '',
                    isActive: false,
                    lastRunAt: null,
                    _count: { runs: 0 },
                    completedRuns: 0,
                  } as Rule)
                }
                className="rounded-card border border-[color:var(--color-border)] p-4 text-start transition-colors duration-150 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <p className="text-sm font-medium">{template.name}</p>
                <p className="mt-1 text-xs muted">{template.description}</p>
                <p className="mt-2 text-[11px] muted">
                  {template.steps.length} step{template.steps.length === 1 ? '' : 's'}
                </p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {editing && (
        <RuleEditor
          rule={editing === 'new' ? null : editing}
          templates={templates}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.show('Rule saved.', 'success');
            void load();
          }}
          onError={(m) => toast.show(m, 'alert')}
        />
      )}

      {inspecting && (
        <RuleRuns
          rule={inspecting.rule}
          initialFilter={inspecting.filter}
          onClose={() => setInspecting(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void remove()}
        loading={deleting}
        destructive
        confirmLabel={t('deleteRule')}
        title={`Delete "${pendingDelete?.name ?? ''}"?`}
        description={t('contactsAlreadyInTheSequence')}
      />

      <Modal
        open={Boolean(testResult)}
        onClose={() => setTestResult(null)}
        title={`Dry run: ${testResult?.rule ?? ''}`}
        description={t('nothingWasSentThisIs')}
        footer={
          <Button variant="secondary" size="sm" onClick={() => setTestResult(null)}>{t('close')}</Button>
        }
      >
        {testResult && (
          <div className="space-y-4">
            <div className="rounded-control border border-[color:var(--color-border)] p-3">
              <p className="text-sm">
                <strong className="tabular-nums">{testResult.matchedContacts}</strong> contact
                {testResult.matchedContacts === 1 ? '' : 's'} currently match this trigger.
              </p>
              {testResult.usingPlaceholder && (
                <p className="mt-1 text-xs muted">{t('noRealContactMatchedYet')}</p>
              )}
            </div>

            <ol className="space-y-2">
              {testResult.preview.map((step) => (
                <li
                  key={step.index}
                  className="rounded-control border border-[color:var(--color-border)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Step {step.index + 1}</span>
                    <Badge>{step.runsAfter}</Badge>
                  </div>
                  <p className="mt-1 text-xs">{step.summary}</p>
                  {step.detail && <p className="mt-1 text-xs muted">{step.detail}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </Modal>

      {toast.node}
    </>
  );
}
