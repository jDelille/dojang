'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Field, Input, Select } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { Feedback, Notice, money, preview, useHubActions, useHubRead, when } from '@/components/hub/hub-client';
import { SUBTLE_LINK, TEXT, today } from '@/components/hub/crm-parts';
import { cn } from '@/lib/utils';

/** Ported from Jodi's TrialPanel (PRs #32–38): reserve, cancel, record the outcome and convert a lead's trial. */

type Trial = {
  id: string;
  state: string;
  version: number;
  member: { id: string; name: string };
  session: { id: string; title: string; startsAt: string; canRecordOutcome: boolean; canCancel: boolean };
  reservedBy: string | null;
  outcomeBy: string | null;
  subscriptionId: string | null;
};
type TrialContext = {
  lead: { id: string; name: string; version: number; stage: string | null; contact: string | null };
  trials: Trial[];
  students: { id: string; name: string; memberNumber: string; state: string }[];
  sessions: { id: string; title: string; startsAt: string; version: number; registered: number; capacity: number; courseRoster: boolean }[];
  plans: { id: string; name: string; price: number; currency: string; billingPeriod: string; initialFee: number; autoSendInvoice: boolean }[];
  stageAutomations: string[];
};
type Conversion = {
  member: string;
  payer: string;
  startDate: string;
  coversTrialClass: boolean;
  creates: string[];
  doesNot: string[];
  billing: string;
  version: number;
  reviewToken: string;
  plan: { name: string; price: number; currency: string; billingPeriod: string; initialFee: number };
};
type TrialReview = { path: string; payload: Record<string, unknown>; expectedVersion?: number; title: string; lines: string[] };

export function TrialPanel({ leadId, onSaved }: { leadId: string; onSaved: () => Promise<unknown> }) {
  const scope = `trial:${leadId}`;
  const [search, setSearch] = useState('');
  const trial = useHubRead<TrialContext>(`leads/${leadId}/trial?query=${encodeURIComponent(search)}`);
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(async () => {
    await trial.reload();
    await onSaved();
  });

  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [reason, setReason] = useState('');
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [conversion, setConversion] = useState<Conversion | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [review, setReview] = useState<TrialReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const inFlight = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const result = feedback[scope];
  const blocked = busy || locked;

  useEffect(() => {
    if (review || result) resultRef.current?.focus({ preventScroll: true });
  }, [review, result]);

  const data = trial.data;
  if (trial.loading && !data) return <Notice>Loading trial options…</Notice>;
  if (trial.error && !data) return <Notice tone="alert">{explainHubError(trial.error)}</Notice>;
  if (!data) return null;

  const open = data.trials.find((t) => ['reserved', 'attended'].includes(t.state));
  const student = data.students.find((s) => s.id === memberId);
  const session = data.sessions.find((s) => s.id === sessionId);
  const automations = data.stageAutomations.length
    ? `Odoo stage automations (${data.stageAutomations.join('; ')}) are not triggered because the stage does not change.`
    : 'No stage automation is triggered because the stage does not change.';

  function prepare(next: TrialReview) {
    clearFeedback(scope);
    setConfirmed(false);
    setReview(next);
  }

  function resetAfterWrite() {
    setReview(null);
    setConfirmed(false);
    setConversion(null);
    setReason('');
    setMemberId('');
    setSessionId('');
  }

  async function confirm() {
    if (!review || !confirmed || blocked || inFlight.current) return;
    inFlight.current = true;
    try {
      const outcome = await act(scope, review.path, review.payload, { expectedVersion: review.expectedVersion });
      if (outcome?.kind === 'success' || outcome?.kind === 'error') resetAfterWrite();
    } finally {
      inFlight.current = false;
    }
  }

  async function checkAgain() {
    const outcome = await retry();
    if (outcome?.kind === 'success') resetAfterWrite();
  }

  async function previewConversion() {
    if (!open || !planId || blocked) return;
    setConversion(null);
    setPreviewError('');
    try {
      setConversion(await preview<Conversion>(`trials/${open.id}/conversion/preview`, { planId, startDate }));
    } catch (error) {
      setPreviewError(explainHubError((error as Error).message));
    }
  }

  function reviewReservation() {
    if (!student || !session) return;
    prepare({
      path: `leads/${leadId}/trial`,
      payload: {
        expectedLeadVersion: data!.lead.version,
        memberId: student.id,
        sessionId: session.id,
        expectedSessionVersion: session.version,
        reason: reason.trim(),
      },
      title: `Reserve ${student.name} for ${session.title}`,
      lines: [
        `${when(session.startsAt)} · creates a class registration for this one class; membership checks are not applied to the trial booking.`,
        'Capacity and course roster rules still apply.',
        'Does not change the CRM stage, create a membership or send a message.',
        automations,
      ],
    });
  }

  function reviewOutcome(trialToRecord: Trial, outcome: 'attended' | 'no_show') {
    const attended = outcome === 'attended';
    prepare({
      path: `trials/${trialToRecord.id}/outcome`,
      payload: { outcome, reason: reason.trim() },
      expectedVersion: trialToRecord.version,
      title: attended ? `${trialToRecord.member.name} attended the trial` : `${trialToRecord.member.name} did not attend`,
      lines: attended
        ? ['Saves a present attendance record for this class and marks the lead as trial attended.', 'Does not change the CRM stage or send an offer.']
        : ['Saves an absent attendance record for this class.', 'Does not set the CRM no-show flag, so no automatic follow-up email is scheduled.'],
    });
  }

  const reasonField = (label: string) => (
    <Field label={label}>
      <Input value={reason} maxLength={500} disabled={blocked} onChange={(e) => setReason(e.target.value)} />
    </Field>
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Trial</h3>
      {trial.error && !trial.loading && <Notice tone="alert">{explainHubError(trial.error)}</Notice>}
      {data.trials.map((t) => (
        <p key={t.id} className={TEXT}>
          {t.member.name} · {t.session.title} · {when(t.session.startsAt)} · <strong>{t.state.replace('_', ' ')}</strong>
          {t.subscriptionId ? ' · membership created' : ''}
        </p>
      ))}

      {!open && (
        <div className="space-y-3">
          <p className={TEXT}>
            Reserve a real trial class for an existing student record. Create the student first if needed:{' '}
            <Link href="/dashboard/contacts/new" className={SUBTLE_LINK}>
              New student →
            </Link>
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Field label="Find trial student">
                <Input
                  value={query}
                  maxLength={100}
                  disabled={blocked}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSearch(query.trim());
                  }}
                />
              </Field>
            </div>
            <Button variant="secondary" disabled={blocked} onClick={() => setSearch(query.trim())}>
              {trial.loading ? 'Searching…' : 'Search students'}
            </Button>
          </div>
          <Field label="Trial student">
            <Select value={memberId} disabled={blocked} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">Choose the exact student</option>
              {data.students.map((s) => (
                <option key={s.id} value={s.id} disabled={!['lead', 'trial'].includes(s.state)}>
                  {s.name} · {s.memberNumber} · {s.state}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Trial class">
            <Select value={sessionId} disabled={blocked} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">Choose an upcoming class</option>
              {data.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {when(s.startsAt)} · {s.capacity ? `${s.registered}/${s.capacity} booked` : `${s.registered} booked`}
                  {s.courseRoster ? ' · course roster' : ''}
                </option>
              ))}
            </Select>
          </Field>
          {!data.sessions.length && <p className={TEXT}>No upcoming classes are open for a trial.</p>}
          {reasonField('Reason for this trial')}
          <Button variant="secondary" disabled={blocked || !student || !session || !reason.trim()} onClick={reviewReservation}>
            Review trial reservation
          </Button>
        </div>
      )}

      {open?.state === 'reserved' && open.session.canCancel && (
        <div className="space-y-3">
          {reasonField('Reason for cancelling')}
          <Button
            variant="secondary"
            disabled={blocked || !reason.trim()}
            onClick={() =>
              prepare({
                path: `trials/${open.id}/cancellation`,
                payload: { reason: reason.trim() },
                expectedVersion: open.version,
                title: `Cancel ${open.member.name}'s trial`,
                lines: ['Cancels the class registration and returns the student to lead status.', 'No message is sent.'],
              })
            }
          >
            Review trial cancellation
          </Button>
        </div>
      )}

      {open?.state === 'reserved' && open.session.canRecordOutcome && (
        <div className="space-y-3">
          {reasonField('Trial note')}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={blocked || !reason.trim()} onClick={() => reviewOutcome(open, 'attended')}>
              Review attended
            </Button>
            <Button variant="secondary" disabled={blocked || !reason.trim()} onClick={() => reviewOutcome(open, 'no_show')}>
              Review no-show
            </Button>
          </div>
        </div>
      )}

      {open?.state === 'attended' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Membership plan">
              <Select
                value={planId}
                disabled={blocked}
                onChange={(e) => {
                  setPlanId(e.target.value);
                  setConversion(null);
                }}
              >
                <option value="">Choose a plan</option>
                {data.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {money(p.price, p.currency)} / {p.billingPeriod}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Membership start">
              <Input
                type="date"
                value={startDate}
                min={today()}
                disabled={blocked}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setConversion(null);
                }}
              />
            </Field>
          </div>
          <Button variant="secondary" disabled={blocked || !planId} onClick={() => void previewConversion()}>
            Preview conversion
          </Button>
          {previewError && <Notice tone="alert">{previewError}</Notice>}
          {conversion && (
            <div aria-label="Conversion preview" className={cn(TEXT, 'space-y-2')}>
              <p>
                {conversion.member} · {conversion.plan.name} · {money(conversion.plan.price, conversion.plan.currency)} / {conversion.plan.billingPeriod}
                {conversion.plan.initialFee ? ` · initial fee ${money(conversion.plan.initialFee, conversion.plan.currency)}` : ''} · billed to{' '}
                {conversion.payer}
              </p>
              {!conversion.coversTrialClass && <Notice tone="alert">This plan does not cover the trial class’s program or course.</Notice>}
              <h4 className="font-semibold">Odoo will</h4>
              <ul className="list-disc space-y-1 ps-5">
                {conversion.creates.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p>{conversion.billing}</p>
              <h4 className="font-semibold">Odoo will not</h4>
              <ul className="list-disc space-y-1 ps-5">
                {conversion.doesNot.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {reasonField('Reason for converting')}
              <Button
                variant="secondary"
                disabled={blocked || !reason.trim()}
                onClick={() =>
                  prepare({
                    path: `trials/${open.id}/conversion`,
                    payload: { planId, startDate, reason: reason.trim(), reviewToken: conversion.reviewToken },
                    expectedVersion: conversion.version,
                    title: `Convert ${conversion.member} to ${conversion.plan.name}`,
                    lines: [...conversion.creates, conversion.billing, ...conversion.doesNot.map((line) => `Will not: ${line}`)],
                  })
                }
              >
                Review conversion
              </Button>
            </div>
          )}
        </div>
      )}

      <div ref={resultRef} tabIndex={-1} className="space-y-3 outline-none">
        {review && (
          <div aria-label="Review trial action" className={cn(PANEL, 'space-y-2 border-accent')}>
            <h4 className="text-sm font-semibold">{review.title}</h4>
            <ul className={cn(TEXT, 'list-disc space-y-1 ps-5')}>
              {review.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <label className={cn(TEXT, 'flex items-start gap-2')}>
              <input type="checkbox" className="mt-0.5" checked={confirmed} disabled={blocked} onChange={(e) => setConfirmed(e.target.checked)} />
              I reviewed what Odoo will and will not do.
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={blocked || !confirmed} onClick={() => void confirm()}>
                {busy ? 'Saving…' : 'Confirm trial action in Odoo'}
              </Button>
              <Button variant="ghost" disabled={blocked} onClick={() => setReview(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <Feedback value={result} busy={busy} onRetry={pendingIn(scope) ? () => void checkAgain() : undefined} />
      </div>
    </div>
  );
}
