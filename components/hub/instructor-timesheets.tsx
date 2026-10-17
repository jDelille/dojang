'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, useHubActions, useHubRead, when } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/** Ported from Jodi's InstructorWorkspace: clock in/out with a PIN, and review or correct timesheets. */

type Shift = {
  id: string;
  instructor: string;
  checkIn: string;
  checkOut: string | null;
  hours: number;
  version: number;
  state: string;
  needsReview: boolean;
  correctable: boolean;
};
type Data = {
  instructor: { id: string; name: string } | null;
  current: Shift | null;
  canCorrect: boolean;
  shifts: Shift[];
  windowDays: number;
  truncated: boolean;
};
/** One write the user is reviewing before it goes to Odoo. `path` is under /api/v2. */
type Review = { path: string; payload: Record<string, unknown>; expectedVersion?: number; description: string };

const TEXT = 'text-[13px]';
const ROW = 'space-y-1 border-t border-[color:var(--color-border)] pt-3 first:border-t-0 first:pt-0';
const SCOPE = 'instructor';

/** An ISO time as the value a datetime-local input expects, in this device's timezone. */
function localInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function InstructorTimesheets() {
  return (
    <HubGate capability="instructor.use">
      <InstructorTimesheetsPanel />
    </HubGate>
  );
}

function InstructorTimesheetsPanel() {
  const timesheets = useHubRead<Data>('instructor/timesheets');
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(() => timesheets.reload());
  const [review, setReview] = useState<Review | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);

  const data = timesheets.data && Array.isArray(timesheets.data.shifts) ? timesheets.data : null;
  const disabled = busy || locked || timesheets.loading;
  const result = feedback[SCOPE];

  useEffect(() => {
    if (review) reviewRef.current?.focus();
  }, [review]);

  function refresh() {
    setReview(null);
    clearFeedback(SCOPE);
    void timesheets.reload().catch(() => undefined);
  }

  function prepare(value: Review) {
    if (disabled) return;
    clearFeedback(SCOPE);
    setReview(value);
  }

  async function confirm() {
    if (!review || disabled || submitting.current) return;
    submitting.current = true;
    try {
      const outcome = await act(SCOPE, review.path, review.payload, { expectedVersion: review.expectedVersion });
      if (outcome?.kind === 'success' || outcome?.kind === 'error') setReview(null);
    } finally {
      submitting.current = false;
    }
  }

  async function checkOriginal() {
    const outcome = await retry();
    if (outcome?.kind === 'success') setReview(null);
  }

  function clock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.instructor) return;
    const pin = String(new FormData(event.currentTarget).get('pin') || '');
    event.currentTarget.reset();
    const current = data.current;
    prepare({
      path: 'instructor/clock',
      payload: { direction: current ? 'out' : 'in', currentShiftId: current?.id ?? null, pin },
      description: current
        ? `Clock out as ${data.instructor.name}, ending the shift started ${when(current.checkIn)}. Odoo records the server time when confirmed.`
        : `Clock in as ${data.instructor.name}. Odoo records the server time when confirmed.`,
    });
  }

  return (
    <section className={cn(PANEL, 'space-y-3')} aria-label="Clock in and timesheets">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">Clock in and timesheets</p>
        <Button size="sm" disabled={disabled} onClick={refresh}>
          Refresh shifts
        </Button>
      </div>

      {timesheets.loading && <Notice>Loading your shifts from Odoo…</Notice>}
      {timesheets.error && <Notice tone="alert">{explainHubError(timesheets.error)} No cached employee records are substituted.</Notice>}
      {!timesheets.loading && !timesheets.error && timesheets.data && !data && (
        <Notice tone="alert">{explainHubError('INSTRUCTOR_DETAILS_UNAVAILABLE')}</Notice>
      )}

      <Feedback value={result} busy={busy} onRetry={pendingIn(SCOPE) ? () => void checkOriginal() : undefined} />

      {data && !timesheets.loading && (
        <>
          {review && (
            <div ref={reviewRef} tabIndex={-1} role="group" aria-label="Review instructor action" className={cn(PANEL, 'space-y-2 border-accent/50')}>
              <h3 className="font-semibold">Review before saving</h3>
              <p className={TEXT}>{review.description}</p>
              <p className={cn(TEXT, 'muted')}>No student attendance, messages or payments will change.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" disabled={disabled} onClick={() => void confirm()}>
                  Confirm instructor action in Odoo
                </Button>
                <Button variant="ghost" disabled={disabled} onClick={() => setReview(null)}>
                  Cancel review
                </Button>
              </div>
            </div>
          )}

          {data.instructor ? (
            <div className="space-y-2">
              <h3 className="font-semibold">{data.instructor.name}</h3>
              <p className={TEXT}>{data.current ? `Clocked in since ${when(data.current.checkIn)}` : 'Not currently clocked in'}</p>
              <form className="flex flex-wrap items-end gap-2" onSubmit={clock}>
                <Field label="Instructor PIN">
                  <Input
                    name="pin"
                    aria-label="Instructor PIN"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                    disabled={disabled || Boolean(review)}
                    className="w-32"
                  />
                </Field>
                <Button type="submit" disabled={disabled || Boolean(review)}>
                  Review clock {data.current ? 'out' : 'in'}
                </Button>
              </form>
              <p className="text-[12px] muted">The PIN does not let you choose another instructor. Sign out before handing this device to another person.</p>
            </div>
          ) : (
            <Notice tone="alert">
              No active instructor profile is linked to your account at this school. An administrator must link the existing profile before clocking in.
            </Notice>
          )}

          <div className="space-y-3 border-t border-[color:var(--color-border)] pt-3">
            <h3 className="font-semibold">{data.canCorrect ? 'Team timesheets' : 'Your timesheets'}</h3>
            <p className="text-[12px] muted">
              Last {data.windowDays} days
              {data.truncated ? ' · showing the latest 100 shifts; review older records in Odoo' : ''}. Open shifts have no final worked-hours total.
            </p>
            {!data.shifts.length && <p className={TEXT}>No shifts in this period. Shifts appear here once an instructor clocks in.</p>}
            {data.shifts.map((shift) => (
              <div key={`${shift.id}:${shift.version}`} className={ROW} aria-label={`Shift ${shift.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className={TEXT}>{shift.instructor}</strong>
                  <span className={TEXT}>{shift.checkOut ? `${shift.hours.toFixed(2)} hours` : 'In progress'}</span>
                </div>
                <p className={cn(TEXT, 'muted')}>
                  {when(shift.checkIn)} → {shift.checkOut ? when(shift.checkOut) : 'Not clocked out'}
                </p>
                <p className="text-[12px] muted">
                  Odoo shift {shift.id} · {shift.state}
                  {shift.needsReview ? ' · Automatic close needs review' : ''}
                </p>
                {data.canCorrect && shift.correctable && shift.checkOut && (
                  <Correction shift={shift} disabled={disabled || Boolean(review)} prepare={prepare} />
                )}
                {data.canCorrect && !shift.correctable && (
                  <p className="text-[12px] muted">Only closed draft shifts can be corrected here. Validated or open shifts require the native HR workflow.</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Correction({ shift, disabled, prepare }: { shift: Shift; disabled: boolean; prepare: (review: Review) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const checkIn = new Date(String(values.get('checkIn')));
    const checkOut = new Date(String(values.get('checkOut')));
    if (!Number.isFinite(checkIn.getTime()) || !Number.isFinite(checkOut.getTime())) return;
    const reason = String(values.get('reason') || '').trim();
    prepare({
      path: `timesheets/${shift.id}/correction`,
      payload: { checkIn: checkIn.toISOString(), checkOut: checkOut.toISOString(), reason },
      expectedVersion: shift.version,
      description: `Correct ${shift.instructor}’s shift from ${when(shift.checkIn)} – ${when(shift.checkOut)} to ${checkIn.toLocaleString()} – ${checkOut.toLocaleString()}. Reason: ${reason}.`,
    });
  }

  return (
    <details className="pt-1">
      <summary className="cursor-pointer text-[13px] font-semibold">Correct this timesheet</summary>
      <form className="mt-2 space-y-2" onSubmit={submit}>
        <p className="text-[12px] muted">Times are in this device’s timezone. Odoo rejects overlapping shifts. This does not approve payroll.</p>
        <Field label="Corrected clock-in">
          <Input name="checkIn" type="datetime-local" defaultValue={localInput(shift.checkIn)} required disabled={disabled} />
        </Field>
        <Field label="Corrected clock-out">
          <Input name="checkOut" type="datetime-local" defaultValue={shift.checkOut ? localInput(shift.checkOut) : ''} required disabled={disabled} />
        </Field>
        <Field label="Correction reason">
          <Textarea name="reason" maxLength={500} required disabled={disabled} />
        </Field>
        <Button type="submit" size="sm" disabled={disabled}>
          Review timesheet correction
        </Button>
      </form>
    </details>
  );
}
