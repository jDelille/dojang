'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, Field, Input, Select } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, useHubActions, useHubRead, when } from '@/components/hub/hub-client';
import {
  EvidenceDetail,
  LeadForm,
  NoteField,
  ReviewCard,
  Section,
  SUBTLE_LINK,
  TaskRows,
  TEXT,
  formText,
  memberHref,
  today,
  type CrmContext,
  type Lead,
  type Review,
  type Stage,
  type Task,
} from '@/components/hub/crm-parts';
import { TrialPanel } from '@/components/hub/trial-panel';
import { cn } from '@/lib/utils';

/** Ported from Jodi's CrmWorkspace lead detail (PRs #21/#22) with the trial panel (#32–38). */

type LeadDetail = {
  lead: Lead;
  tasks: Task[];
  stages: Stage[];
  memberId: string | null;
  trial: { title: string; startsAt: string } | null;
  timeline: { id: string; action: string; actor: string; at: string }[];
  notes?: { id: string; text: string; author: string; at: string }[];
};

const ACTION_LABELS: Record<string, string> = {
  follow_up: 'Prepare follow-up',
  trial: 'Review trial options',
  reactivation: 'Review reactivation',
  conversion: 'Review member conversion',
};

export function SalesLead({ leadId }: { leadId: string }) {
  return (
    <HubGate capability="leads.write">
      <SalesLeadScreen leadId={leadId} />
    </HubGate>
  );
}

function SalesLeadScreen({ leadId }: { leadId: string }) {
  const scope = `lead:${leadId}`;
  const detail = useHubRead<LeadDetail>(`leads/${leadId}`);
  // The pipeline read carries the staff members a lead may be assigned to.
  const crm = useHubRead<CrmContext>('leads?q=');
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(detail.reload);

  const [review, setReview] = useState<Review | null>(null);
  const [actionKind, setActionKind] = useState('follow_up');
  const [assignee, setAssignee] = useState('');
  const [proposedStage, setProposedStage] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const reviewRef = useRef<HTMLElement>(null);
  const actionFormRef = useRef<HTMLFormElement>(null);

  const result = feedback[scope];
  const disabled = busy || locked || Boolean(review);
  const data = detail.data?.lead?.id === leadId ? detail.data : null;

  useEffect(() => {
    if (review) {
      reviewRef.current?.focus({ preventScroll: true });
      reviewRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [review]);

  function prepare(next: Review) {
    clearFeedback(scope);
    setReview(next);
  }

  function finish(kind: string | undefined) {
    if (kind && kind !== 'uncertain') setReview(null);
    if (kind === 'success') {
      setSavedCount((count) => count + 1);
      setProposedStage('');
      setAssignee('');
    }
  }

  async function confirm() {
    if (!review) return;
    const outcome = await act(scope, review.path, review.payload, { expectedVersion: review.expectedVersion });
    finish(outcome?.kind);
  }

  async function checkAgain() {
    const outcome = await retry();
    finish(outcome?.kind);
  }

  if (detail.loading && !data) return <Notice>Loading lead from Odoo…</Notice>;
  if (detail.error && !data) return <Notice tone="alert">{explainHubError(detail.error)}</Notice>;
  if (!data) return <Notice tone="alert">This lead is unavailable with your current account.</Notice>;

  const lead = data.lead;
  const assignees = crm.data?.assignees ?? [];

  function applyRecommendedAction() {
    setActionKind(lead.evidence?.nextAction ?? 'follow_up');
    actionFormRef.current?.scrollIntoView({ block: 'center' });
    actionFormRef.current?.querySelector('textarea')?.focus();
  }

  function submitAction(event: FormEvent<HTMLFormElement>) {
    const get = formText(event);
    const reason = get('reason');
    const due = get('due');
    prepare({
      path: `leads/${leadId}/next-action`,
      payload: { kind: actionKind, reason, due },
      expectedVersion: lead.version,
      description: `${ACTION_LABELS[actionKind]} for ${lead.name}. Reason: ${reason}. Due ${due}. This saves an internal review task; it does not send a message, book a trial, create a member or change a subscription.`,
    });
  }

  function submitAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = assignees.find((u) => u.id === assignee);
    if (!user) return;
    prepare({
      path: `leads/${leadId}/owner`,
      payload: { ownerId: user.id },
      expectedVersion: lead.version,
      description: `Assign ${lead.name} to ${user.name}. This changes the lead owner within this school and sends no customer message.`,
    });
  }

  function submitNote(event: FormEvent<HTMLFormElement>) {
    const note = formText(event)('note');
    prepare({
      path: `leads/${leadId}/notes`,
      payload: { note },
      expectedVersion: lead.version,
      description: `Add an internal note to ${lead.name}: ${note}. No customer notification will be sent.`,
    });
  }

  function submitStage(event: FormEvent<HTMLFormElement>) {
    const get = formText(event);
    const next = data!.stages.find((s) => s.id === proposedStage);
    if (!next) return;
    const reason = get('reason');
    prepare({
      path: `leads/${leadId}/stage-proposal`,
      payload: { stageId: next.id, reason, due: get('due') },
      expectedVersion: lead.version,
      description: `Create a review task for ${lead.name}: ${lead.stage} → ${next.name}. ${reason}. The lead stays in its current stage until reviewed in Odoo.`,
    });
  }

  function submitTask(event: FormEvent<HTMLFormElement>) {
    const get = formText(event);
    const summary = get('summary');
    const due = get('due');
    prepare({
      path: 'tasks',
      payload: { relatedType: 'lead', relatedId: leadId, summary, due },
      description: `Create “${summary}” for ${lead.name}, due ${due}, assigned to your account. This is an internal task only.`,
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className={cn(PANEL, 'space-y-3')} aria-label="Lead detail">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{lead.name}</h2>
            <p className={cn(TEXT, 'muted')}>
              {lead.stage} · {lead.owner} · Source: {lead.source}
            </p>
          </div>
          <Link href="/dashboard/sales" className={SUBTLE_LINK}>
            Back to Sales
          </Link>
        </div>
        <EvidenceDetail value={lead.evidence} />
      </section>

      <Feedback value={result} busy={busy} onRetry={pendingIn(scope) ? () => void checkAgain() : undefined} />
      <ReviewCard review={review} busy={busy} locked={locked} onConfirm={() => void confirm()} onCancel={() => setReview(null)} reviewRef={reviewRef} />

      <section className={cn(PANEL, 'space-y-3')} aria-label="Recommended lead action">
        <h3 className="text-sm font-semibold">Next best action</h3>
        <p className={TEXT}>{ACTION_LABELS[lead.evidence?.nextAction ?? 'follow_up']} · Internal review only</p>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={applyRecommendedAction}>
          Use recommended action
        </Button>
        <form ref={actionFormRef} key={`action-${savedCount}`} onSubmit={submitAction} className="space-y-3">
          <Field label="Lead action">
            <Select value={actionKind} onChange={(e) => setActionKind(e.target.value)} disabled={disabled}>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <NoteField label="Review context" name="reason" maxLength={800} disabled={disabled} />
          <Field label="Review due date">
            <Input name="due" type="date" required defaultValue={today()} disabled={disabled} />
          </Field>
          <Button type="submit" variant="secondary" disabled={disabled}>
            Review lead action
          </Button>
        </form>
      </section>

      <section className={cn(PANEL, 'space-y-3')}>
        {assignees.length > 0 && (
          <Section title="Assign staff owner">
            <form onSubmit={submitAssign} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <Field label="Lead owner">
                  <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={disabled}>
                    <option value="">Choose authorized staff</option>
                    {assignees.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button type="submit" variant="secondary" disabled={disabled || !assignee || assignee === lead.ownerId}>
                Review owner assignment
              </Button>
            </form>
          </Section>
        )}

        <Section title="Internal notes">
          <form key={`note-${savedCount}`} onSubmit={submitNote} className="space-y-3">
            <NoteField label="Staff note" name="note" maxLength={2000} disabled={disabled} />
            <Button type="submit" variant="secondary" disabled={disabled}>
              Review internal note
            </Button>
          </form>
          {data.notes?.length ? (
            data.notes.map((note) => (
              <article key={note.id} className={cn(TEXT, 'rounded-control border border-[color:var(--color-border)] px-3 py-2')}>
                <p>{note.text}</p>
                <p className="muted">
                  {note.author} · {when(note.at)}
                </p>
              </article>
            ))
          ) : (
            <p className={TEXT}>No internal notes returned.</p>
          )}
        </Section>

        <Section title="Edit lead">
          <LeadForm key={`${lead.id}:${lead.version}:${savedCount}`} lead={lead} disabled={disabled} onReview={prepare} />
        </Section>

        <Section title="Propose a stage change">
          <form key={`stage-${savedCount}`} onSubmit={submitStage} className="space-y-3">
            <Field label="Proposed stage">
              <Select value={proposedStage} onChange={(e) => setProposedStage(e.target.value)} disabled={disabled}>
                <option value="">Choose a configured stage</option>
                {data.stages
                  .filter((s) => s.id !== lead.stageId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reason">
                <Input name="reason" required maxLength={120} disabled={disabled} />
              </Field>
              <Field label="Review due">
                <Input name="due" type="date" required defaultValue={today()} disabled={disabled} />
              </Field>
            </div>
            <Button type="submit" variant="secondary" disabled={disabled || !proposedStage}>
              Review stage proposal
            </Button>
          </form>
        </Section>
      </section>

      <section className={cn(PANEL, 'space-y-3')} aria-label="Trial">
        {data.memberId && (
          <Link href={memberHref(data.memberId)} className={SUBTLE_LINK}>
            Open linked member →
          </Link>
        )}
        <p className={TEXT}>
          {data.trial
            ? `Linked trial: ${data.trial.title} · ${when(data.trial.startsAt)}. Attendance must be checked on the class roster.`
            : 'No trial class linked in Odoo. A task is not a booking.'}
        </p>
        <TrialPanel leadId={leadId} onSaved={detail.reload} />
      </section>

      <section className={cn(PANEL, 'space-y-3')} aria-label="Lead tasks">
        <h3 className="text-sm font-semibold">Lead tasks and outcomes</h3>
        <TaskRows tasks={data.tasks} disabled={disabled} onReview={prepare} />
        <form key={`task-${savedCount}`} onSubmit={submitTask} className="space-y-3 border-t border-[color:var(--color-border)] pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New task for this lead">
              <Input name="summary" required maxLength={200} disabled={disabled} />
            </Field>
            <Field label="Due date">
              <Input name="due" type="date" required defaultValue={today()} disabled={disabled} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={disabled}>
            Review new task
          </Button>
        </form>
      </section>

      <section className={cn(PANEL, 'space-y-2')} aria-label="Companion action history">
        <h3 className="text-sm font-semibold">Companion action history</h3>
        {data.timeline.length ? (
          data.timeline.map((entry) => (
            <p key={entry.id} className={TEXT}>
              {entry.action.replaceAll('_', ' ')} · {entry.actor} · {when(entry.at)}
            </p>
          ))
        ) : (
          <p className={TEXT}>No Companion actions yet. Earlier Odoo history remains in Odoo.</p>
        )}
      </section>
    </div>
  );
}
