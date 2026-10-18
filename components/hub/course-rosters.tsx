'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, preview, useHubActions, useHubRead, when } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/** Ported from Jodi's CourseAssignments. */

type Person = { id: string; name: string };
type Template = { id: string; name: string; version: number; memberCount: number; autoEnroll: boolean };
type Course = {
  id: string;
  name: string;
  version: number;
  autoEnroll: boolean;
  upcomingSessions: number;
  members: Person[];
  candidates: Person[];
};
type Roster = { templates: Template[]; course: Course | null };
type Preview = {
  course: string;
  autoEnroll: boolean;
  valid: boolean;
  reviewToken: string | null;
  version: number;
  add: { memberId: string; name: string; futureBookings: number }[];
  remove: { memberId: string; name: string; cancelledBookings: number }[];
  capacityConflicts: { sessionId: string; title: string; startsAt: string; capacity: number; registered: number; adding: number }[];
};

/** Odoo accepts up to 50 students per change. */
const LIMIT = 50;
const SHOWN = 100;
const TEXT = 'text-[13px]';
const SCOPE = 'courses';

export function CourseRosters() {
  return (
    <HubGate capability="courses.manage">
      <CourseRostersScreen />
    </HubGate>
  );
}

function CourseRostersScreen() {
  const [templateId, setTemplateId] = useState('');
  // Odoo requires templateId on every read, so it is sent even when empty.
  const roster = useHubRead<Roster>(`courses?templateId=${encodeURIComponent(templateId)}`);
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(roster.reload);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string[]>([]);
  const [review, setReview] = useState<Preview | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const result = feedback[SCOPE];
  const blocked = busy || locked || reviewing;
  const course = roster.data?.course && roster.data.course.id === templateId ? roster.data.course : null;
  const search = query.trim().toLowerCase();
  const candidates = (course?.candidates ?? []).filter((person) => person.name.toLowerCase().includes(search));

  useEffect(() => {
    if (review || result) resultRef.current?.focus({ preventScroll: true });
  }, [review, result]);

  function resetReview() {
    setReview(null);
    setReviewError('');
    setConfirmed(false);
    clearFeedback(SCOPE);
  }

  function clearChanges() {
    setAdding([]);
    setRemoving([]);
    setReason('');
    setReview(null);
    setConfirmed(false);
  }

  function choose(id: string) {
    setTemplateId(id);
    setQuery('');
    clearChanges();
    resetReview();
  }

  function toggle(list: string[], setList: (value: string[]) => void, id: string) {
    resetReview();
    if (list.includes(id)) setList(list.filter((value) => value !== id));
    else if (list.length < LIMIT) setList([...list, id]);
  }

  async function startReview() {
    if (!course || blocked || (!adding.length && !removing.length)) return;
    resetReview();
    setReviewing(true);
    try {
      const value = await preview<Preview>(`courses/${course.id}/assignment/preview`, {
        addMemberIds: adding,
        removeMemberIds: removing,
      });
      if (!Array.isArray(value.add) || !Array.isArray(value.remove)) throw new Error('BACKEND_UNAVAILABLE');
      setReview(value);
    } catch (error) {
      setReviewError(explainHubError((error as Error).message));
    } finally {
      setReviewing(false);
    }
  }

  async function confirm() {
    if (!course || !review?.reviewToken || !confirmed || !reason.trim() || blocked) return;
    const saved = await act(
      SCOPE,
      `courses/${course.id}/assignment`,
      {
        addMemberIds: adding,
        removeMemberIds: removing,
        reason: reason.trim(),
        reviewToken: review.reviewToken,
      },
      { expectedVersion: review.version },
    );
    if (saved?.kind === 'success') clearChanges();
    else if (saved?.kind === 'error') {
      setReview(null);
      setConfirmed(false);
    }
  }

  async function checkResult() {
    const saved = await retry();
    if (saved?.kind === 'success') clearChanges();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className={cn(PANEL, 'space-y-2')}>
        <h2 className="text-base font-semibold">Assign students to a course</h2>
        <p className={TEXT}>
          Course members are enrolled in upcoming generated classes by the school’s course rules. Removing a student cancels their upcoming
          registered classes for this course.
        </p>
        <p className={cn(TEXT, 'muted')}>Up to {LIMIT} students per change. Nothing changes until you review and confirm.</p>
      </section>

      {roster.loading && <Notice>Loading course rosters from Odoo…</Notice>}
      {!roster.loading && roster.error && <Notice tone="alert">{explainHubError(roster.error)}</Notice>}

      {roster.data && (
        <section className={cn(PANEL, 'space-y-4')} aria-label="Course roster">
          <Field label="Course">
            <Select aria-label="Course" value={templateId} disabled={blocked} onChange={(event) => choose(event.target.value)}>
              <option value="">Choose a course</option>
              {roster.data.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · {template.memberCount} on roster
                </option>
              ))}
            </Select>
          </Field>
          {!roster.data.templates.length && <p className={TEXT}>No active course templates exist in this school.</p>}

          {course && (
            <>
              <p className={TEXT}>
                {course.upcomingSessions} upcoming classes ·{' '}
                {course.autoEnroll
                  ? 'Course members are enrolled automatically'
                  : 'Automatic enrollment is off; roster changes do not create bookings'}
              </p>

              <fieldset disabled={blocked} className="space-y-1">
                <legend className="mb-1 text-[13px] font-semibold">Current roster ({course.members.length}) — tick to remove</legend>
                {course.members.map((member) => (
                  <label key={member.id} className={cn(TEXT, 'flex items-center gap-2')}>
                    <input
                      type="checkbox"
                      aria-label={`Remove ${member.name}`}
                      checked={removing.includes(member.id)}
                      onChange={() => toggle(removing, setRemoving, member.id)}
                    />
                    {member.name}
                  </label>
                ))}
                {!course.members.length && <p className={cn(TEXT, 'muted')}>No students are on this course roster.</p>}
              </fieldset>

              <fieldset disabled={blocked} className="space-y-1">
                <legend className="mb-1 text-[13px] font-semibold">Add students</legend>
                <Field label="Find students to add">
                  <Input value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} />
                </Field>
                {candidates.slice(0, SHOWN).map((member) => (
                  <label key={member.id} className={cn(TEXT, 'flex items-center gap-2')}>
                    <input
                      type="checkbox"
                      aria-label={`Add ${member.name}`}
                      checked={adding.includes(member.id)}
                      onChange={() => toggle(adding, setAdding, member.id)}
                    />
                    {member.name}
                  </label>
                ))}
                {!candidates.length && <p className={cn(TEXT, 'muted')}>No matching active students outside this roster.</p>}
                {candidates.length > SHOWN && <p className={cn(TEXT, 'muted')}>Showing the first {SHOWN} matches. Narrow your search.</p>}
              </fieldset>

              <p className={TEXT}>
                {adding.length} to add · {removing.length} to remove
              </p>
              <Button variant="secondary" disabled={blocked || (!adding.length && !removing.length)} onClick={() => void startReview()}>
                {reviewing ? 'Checking upcoming classes…' : 'Review course assignment'}
              </Button>
            </>
          )}
        </section>
      )}

      <div ref={resultRef} tabIndex={-1} aria-label="Course assignment result" className="space-y-4">
        {reviewError && <Notice tone="alert">{reviewError}</Notice>}

        {review && (
          <section className={cn(PANEL, 'space-y-3')} aria-label="Review course assignment">
            <h2 className="text-base font-semibold">Review before saving: {review.course}</h2>
            <ul className={cn(TEXT, 'space-y-1')}>
              {review.add.map((item) => (
                <li key={item.memberId}>
                  Add <strong>{item.name}</strong>:{' '}
                  {review.autoEnroll ? `${item.futureBookings} upcoming class bookings will be created` : 'no bookings will be created'}
                </li>
              ))}
              {review.remove.map((item) => (
                <li key={item.memberId}>
                  Remove <strong>{item.name}</strong>: {item.cancelledBookings} upcoming registered bookings will be cancelled
                </li>
              ))}
            </ul>

            {review.capacityConflicts.length > 0 && (
              <div role="alert" className={cn(TEXT, 'space-y-1 rounded-control border border-alert/40 px-3 py-2 text-alert')}>
                <p>These classes would exceed capacity. Nothing can be confirmed until this is resolved:</p>
                {review.capacityConflicts.map((conflict) => (
                  <p key={conflict.sessionId}>
                    {conflict.title} · {when(conflict.startsAt)} · {conflict.registered}/{conflict.capacity} booked, adding {conflict.adding}
                  </p>
                ))}
              </div>
            )}

            {review.valid && (
              <>
                <Field label="Reason for this roster change">
                  <Input value={reason} maxLength={500} disabled={blocked} onChange={(event) => setReason(event.target.value)} />
                </Field>
                <label className={cn(TEXT, 'flex items-start gap-2')}>
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={confirmed}
                    disabled={blocked}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  I reviewed the students and the bookings Odoo will create or cancel.
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={blocked || !confirmed || !reason.trim()} onClick={() => void confirm()}>
                    {busy ? 'Updating roster…' : 'Confirm roster change in Odoo'}
                  </Button>
                  <Button variant="ghost" disabled={blocked} onClick={resetReview}>
                    Cancel review
                  </Button>
                </div>
              </>
            )}
            <p className={cn(TEXT, 'muted')}>Membership eligibility is still checked at check-in. No message is sent.</p>
          </section>
        )}

        <Feedback value={result} busy={busy} onRetry={pendingIn(SCOPE) ? () => void checkResult() : undefined} />
      </div>
    </div>
  );
}
