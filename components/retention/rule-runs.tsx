'use client';
import { formatDate } from '@/lib/utils';
import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { ACTION_LABELS, parseSteps, type RetentionStep } from '@/lib/retention-shared';
import { NETWORK_ERROR } from '@/components/retention/types';
import type { Rule } from '@/components/retention/types';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorBlock,
  Field, Input, LoadingBlock, Modal, PageHeader, Select, Spinner, StatusDot, Switch,
  Table, Tabs, Td, Textarea, Th, Tr, useToast,
} from '@/components/ui';
import { relativeTime } from '@/lib/utils';
import { RUN_LABELS, RUN_TONES } from '@/components/retention/types';
import type { Run, RunFilter, RunStatus } from '@/components/retention/types';

/** Who is in the sequence, where they got to, and what went wrong. */
export function RuleRuns({
  rule,
  initialFilter,
  onClose,
}: {
  rule: Rule;
  initialFilter: RunFilter;
  onClose: () => void;
}) {
  const t = useTranslations('retention');
  const [runs, setRuns] = useState<Run[]>([]);
  const [steps, setSteps] = useState<RetentionStep[]>(rule.steps ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RunFilter>(initialFilter);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/retention/rules/${rule.id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not load this rule.');
        return;
      }
      setRuns((data.rule?.runs ?? []) as Run[]);
      setSteps(parseSteps(data.rule?.steps));
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }, [rule.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: runs.length,
      active: runs.filter((r) => r.status === 'pending' || r.status === 'running').length,
      completed: runs.filter((r) => r.status === 'completed').length,
      failed: runs.filter((r) => r.status === 'failed').length,
    }),
    [runs],
  );

  const visible = useMemo(
    () =>
      runs.filter((run) => {
        if (filter === 'all') return true;
        if (filter === 'active') return run.status === 'pending' || run.status === 'running';
        return run.status === filter;
      }),
    [runs, filter],
  );

  return (
    <Modal
      open
      onClose={onClose}
      width="lg"
      title={rule.name}
      description={t('the50MostRecentlyUpdated')}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>{t('close')}</Button>
      }
    >
      {loading ? (
        <LoadingBlock label={t('loadingEnrolments')} />
      ) : error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : (
        <div className="space-y-4">
          <Tabs
            label={t('filterEnrolments')}
            active={filter}
            onChange={(key) => setFilter(key as RunFilter)}
            tabs={[
              { key: 'all', label: 'Everyone', count: counts.all },
              { key: 'active', label: 'In progress', count: counts.active },
              { key: 'completed', label: 'Completed', count: counts.completed },
              { key: 'failed', label: 'Failed', count: counts.failed },
            ]}
          />

          {visible.length ? (
            <Table caption={`Contacts enrolled in ${rule.name}`}>
              <thead>
                <tr>
                  <Th>{t('contact')}</Th>
                  <Th>{t('step')}</Th>
                  <Th>{t('status')}</Th>
                  <Th align="right">{t('updated')}</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((run) => {
                  const step = steps[run.stepIndex];

                  return (
                    <Tr key={run.id}>
                      <Td>
                        <span className="block font-medium">
                          {run.contact?.name ?? 'Unnamed contact'}
                        </span>
                        {run.contact?.email && (
                          <span className="block text-xs muted">{run.contact.email}</span>
                        )}
                      </Td>
                      <Td>
                        <span className="block text-xs">
                          Step {Math.min(run.stepIndex + 1, Math.max(steps.length, 1))}
                          {steps.length ? ` of ${steps.length}` : ''}
                          {step ? ` — ${ACTION_LABELS[step.action]}` : ''}
                        </span>
                        {run.status === 'failed' && run.lastError && (
                          <span className="mt-0.5 block text-xs text-alert">{run.lastError}</span>
                        )}
                        {run.status === 'pending' && run.nextRunAt && (
                          <span className="mt-0.5 block text-xs muted">
                            Next {formatDate(run.nextRunAt, true)}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={RUN_TONES[run.status]}>{RUN_LABELS[run.status]}</Badge>
                        {run.isDryRun && <span className="ms-1 text-xs muted">dry run</span>}
                      </Td>
                      <Td align="right">
                        <span className="text-xs muted">{relativeTime(run.updatedAt)}</span>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              icon={<Users strokeWidth={1.75} />}
              title={counts.all ? 'Nothing in this view' : 'Nobody enrolled yet'}
              description={
                counts.all
                  ? 'Try another filter to see the rest of the sequence.'
                  : 'Contacts appear here the first time the trigger matches them.'
              }
            />
          )}
        </div>
      )}
    </Modal>
  );
}
