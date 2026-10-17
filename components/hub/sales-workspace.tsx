'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, useHubActions, useHubRead } from '@/components/hub/hub-client';
import {
  CrmPulse,
  LeadForm,
  LeadPipeline,
  ReviewCard,
  Section,
  TaskRows,
  TEXT,
  formText,
  priorityRank,
  today,
  type CrmContext,
  type Review,
} from '@/components/hub/crm-parts';
import { cn } from '@/lib/utils';

/** Ported from Jodi's CrmWorkspace (PRs #21/#22): the pipeline, new leads and tasks. One lead opens on its own page. */

const SCOPE = 'crm';

export function SalesWorkspace({ memberId }: { memberId?: string }) {
  return (
    <HubGate capability="leads.write">
      <SalesScreen memberId={memberId} />
    </HubGate>
  );
}

function SalesScreen({ memberId }: { memberId?: string }) {
  const [search, setSearch] = useState('');
  const crm = useHubRead<CrmContext>(`leads?q=${encodeURIComponent(search)}`);
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(crm.reload);

  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('');
  const [owner, setOwner] = useState('');
  const [tag, setTag] = useState('');
  const [priority, setPriority] = useState('');
  const [board, setBoard] = useState(false);
  const [taskTarget, setTaskTarget] = useState(memberId ? `member:${memberId}` : '');
  const [review, setReview] = useState<Review | null>(null);
  // Bumped after each saved write so the "new" forms start empty again.
  const [savedCount, setSavedCount] = useState(0);
  const reviewRef = useRef<HTMLElement>(null);

  const result = feedback[SCOPE];
  const disabled = busy || locked || Boolean(review);
  const data = crm.data;

  useEffect(() => {
    if (review) {
      reviewRef.current?.focus({ preventScroll: true });
      reviewRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [review]);

  function prepare(next: Review) {
    clearFeedback(SCOPE);
    setReview(next);
  }

  async function confirm() {
    if (!review) return;
    const outcome = await act(SCOPE, review.path, review.payload, { expectedVersion: review.expectedVersion });
    if (outcome && outcome.kind !== 'uncertain') setReview(null);
    if (outcome?.kind === 'success') setSavedCount((count) => count + 1);
  }

  async function checkAgain() {
    const outcome = await retry();
    if (outcome && outcome.kind !== 'uncertain') setReview(null);
    if (outcome?.kind === 'success') setSavedCount((count) => count + 1);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(query.trim());
  }

  function submitTask(event: FormEvent<HTMLFormElement>) {
    const get = formText(event);
    if (!data || !taskTarget) return;
    const [relatedType, relatedId] = taskTarget.split(':');
    const list = relatedType === 'lead' ? data.leads : data.members;
    const target = list.find((item) => item.id === relatedId);
    if (!target) return;
    const summary = get('summary');
    const due = get('due');
    prepare({
      path: 'tasks',
      payload: { relatedType, relatedId, summary, due },
      description: `Create “${summary}” for ${target.name}, due ${due}, assigned to your account. This is an internal task only.`,
    });
  }

  if (crm.loading && !data) return <Notice>Loading CRM records…</Notice>;
  if (crm.error && !data) return <Notice tone="alert">{explainHubError(crm.error)}</Notice>;
  if (!data) return null;

  const visible = data.leads
    .filter((lead) => !stage || lead.stageId === stage)
    .filter((lead) => !owner || lead.owner === owner)
    .filter((lead) => !tag || lead.tags.some((t) => t.id === tag))
    .filter((lead) => {
      if (!priority) return true;
      if (priority === 'attention') return ['Now', 'High'].includes(lead.evidence?.priority ?? '');
      return lead.evidence?.priority === priority;
    })
    .sort((a, b) => priorityRank(a) - priorityRank(b));
  const owners = Array.from(new Set(data.leads.map((lead) => lead.owner)));
  const tagMap = new Map<string, string>();
  for (const lead of data.leads) for (const t of lead.tags) tagMap.set(t.id, t.name);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cn(TEXT, 'muted')}>
          Live Odoo records. Changes are reviewed before saving. Stage proposals create internal review tasks, not automatic customer messages.
        </p>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => void crm.reload().catch(() => undefined)}>
          Refresh CRM
        </Button>
      </div>

      <Feedback value={result} busy={busy} onRetry={pendingIn(SCOPE) ? () => void checkAgain() : undefined} />
      <ReviewCard review={review} busy={busy} locked={locked} onConfirm={() => void confirm()} onCancel={() => setReview(null)} reviewRef={reviewRef} />
      {crm.error && !crm.loading && <Notice tone="alert">{explainHubError(crm.error)}</Notice>}

      <CrmPulse leads={data.leads} onPriority={() => setPriority('attention')} />
      <p className={cn(TEXT, 'muted')}>Summary of the loaded search results (up to 100 leads). Open a lead for evidence and reviewed next actions.</p>

      <section className={cn(PANEL, 'space-y-3')}>
        <Section title="New lead">
          <LeadForm key={`new-${savedCount}`} disabled={disabled} onReview={prepare} />
        </Section>

        <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Field label="Search leads">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} disabled={disabled} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={disabled}>
            {crm.loading ? 'Searching…' : 'Search CRM'}
          </Button>
        </form>

        <div className="grid gap-2 sm:grid-cols-4">
          <Select aria-label="Filter stage" value={stage} onChange={(e) => setStage(e.target.value)} disabled={disabled}>
            <option value="">All stages</option>
            {data.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter owner" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={disabled}>
            <option value="">All owners</option>
            {owners.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter priority" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={disabled}>
            <option value="">All priorities</option>
            <option value="attention">Needs attention</option>
            {['Now', 'High', 'Normal', 'Low'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter lead tag" value={tag} onChange={(e) => setTag(e.target.value)} disabled={disabled}>
            <option value="">All tags / interests</option>
            {Array.from(tagMap.entries()).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={TEXT}>
            {visible.length} leads shown{data.moreLeads ? ' · Showing the latest 100 matches; narrow your search.' : ''}
          </p>
          <div role="group" aria-label="Pipeline view" className="flex gap-1">
            <Button size="sm" variant={board ? 'ghost' : 'secondary'} aria-pressed={!board} onClick={() => setBoard(false)}>
              List
            </Button>
            <Button size="sm" variant={board ? 'secondary' : 'ghost'} aria-pressed={board} onClick={() => setBoard(true)}>
              Board
            </Button>
          </div>
        </div>
        <LeadPipeline leads={visible} stages={data.stages} board={board} />
      </section>

      <section className={cn(PANEL, 'space-y-3')} aria-label="Create linked task">
        <h2 className="text-base font-semibold">Next action</h2>
        <form key={`task-${savedCount}`} onSubmit={submitTask} className="space-y-3">
          <Field label="Linked lead or member">
            <Select value={taskTarget} onChange={(e) => setTaskTarget(e.target.value)} disabled={disabled}>
              <option value="">Choose a lead or member</option>
              {data.leads.map((lead) => (
                <option key={`lead:${lead.id}`} value={`lead:${lead.id}`}>
                  Lead · {lead.name}
                </option>
              ))}
              {data.members.map((member) => (
                <option key={`member:${member.id}`} value={`member:${member.id}`}>
                  Member · {member.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Task summary">
              <Input name="summary" required maxLength={200} disabled={disabled} />
            </Field>
            <Field label="Due date">
              <Input name="due" type="date" required defaultValue={today()} disabled={disabled} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={disabled || !taskTarget}>
            Review new task
          </Button>
        </form>
      </section>

      <section className={cn(PANEL, 'space-y-3')} aria-label="Open CRM tasks">
        <h2 className="text-base font-semibold">Open tasks</h2>
        {data.moreTasks && <p className={TEXT}>First 100 due tasks shown. Open the linked lead for its task history.</p>}
        <TaskRows tasks={data.tasks} disabled={disabled} onReview={prepare} />
      </section>
    </div>
  );
}
