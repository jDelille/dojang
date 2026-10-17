'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, useHubActions, useHubRead, when } from '@/components/hub/hub-client';

/** Ported from Jodi's AttendanceWorkspace (PR #31). */

type SessionRow = { id: string; title: string; startsAt: string; endsAt: string; registered: number; attended: number };
type Correction = { before: string; after: string; reason: string; actor: string; at: string; reversal: boolean };
type Row = {
  memberId: string;
  name: string;
  status: string;
  logId: string | null;
  version: number;
  registered: boolean;
  checkedInAt: string | null;
  creditHold: string | null;
  corrections: Correction[];
};
type Sheet = { session: { id: string; title: string; startsAt: string; endsAt: string; open: boolean }; canReverse: boolean; marks: string[]; rows: Row[] };
type Review = { row: Row; status: string; reason: string; reversal: boolean };

const SCOPE = 'attendance';
const ATTENDED = ['present', 'late'];
const label = (status: string) => (status === 'pending' ? 'Not recorded' : status.charAt(0).toUpperCase() + status.slice(1));

export function AttendanceReview() {
  return (
    <HubGate capability="attendance.mark">
      <AttendanceReviewScreen />
    </HubGate>
  );
}

function AttendanceReviewScreen() {
  const sessions = useHubRead<{ sessions: SessionRow[] }>('sessions');
  const [sessionId, setSessionId] = useState('');
  const sheet = useHubRead<Sheet>(sessionId ? `sessions/${sessionId}/attendance` : null);
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(async () => {
    await Promise.all([sheet.reload(), sessions.reload()]);
  });
  const [review, setReview] = useState<Review | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const blocked = busy || locked;

  useEffect(() => {
    if (review || feedback[SCOPE]) resultRef.current?.focus();
  }, [review, feedback]);

  async function confirm() {
    if (!review || !sheet.data || !confirmed || blocked) return;
    const result = await act(
      SCOPE,
      `sessions/${sheet.data.session.id}/attendance`,
      { memberId: review.row.memberId, status: review.status, reason: review.reason },
      { expectedVersion: review.row.version },
    );
    if (result?.kind === 'success' || result?.kind === 'error') {
      setReview(null);
      setConfirmed(false);
    }
  }

  async function checkResult() {
    const result = await retry();
    if (result?.kind === 'success') setReview(null);
  }

  const current = sheet.data && sheet.data.session.id === sessionId ? sheet.data : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section className={PANEL}>
        <h2 className="text-base font-semibold">Record or correct attendance</h2>
        <p className="mt-1 text-[13px]">
          Changes are saved on the native Odoo attendance record with your name, the previous status and your reason. Kiosk check-in receipts are never
          deleted.
        </p>
        <p className="mt-1 text-[12px] muted">
          Classes from the last 7 days and today. Reversing a recorded check-in needs a manager and does not refund a class credit automatically.
        </p>
      </section>

      {sessions.error && <Notice tone="alert">{explainHubError(sessions.error)}</Notice>}
      {sheet.error && <Notice tone="alert">{explainHubError(sheet.error)}</Notice>}

      {!sessions.data ? (
        !sessions.error && <Notice>Loading recent classes…</Notice>
      ) : (
        <section className={`${PANEL} space-y-3`}>
          <Field label="Class">
            <Select
              aria-label="Class to review"
              value={sessionId}
              disabled={blocked}
              onChange={(event) => {
                setSessionId(event.target.value);
                setReview(null);
                clearFeedback(SCOPE);
              }}
            >
              <option value="">Choose a class</option>
              {sessions.data.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {when(s.startsAt)} · {s.attended}/{s.registered} attended
                </option>
              ))}
            </Select>
          </Field>
          {!sessions.data.sessions.length && <p className="text-[13px] muted">No classes in your attendance window.</p>}
          {current && (
            <>
              {!current.session.open && <p className="text-[13px]">This class is outside the 31-day correction window.</p>}
              {current.rows.length ? (
                <ul className="divide-y divide-[color:var(--color-border)]">
                  {current.rows.map((row) => (
                    <RowEditor
                      key={`${row.memberId}:${row.version}:${row.status}`}
                      row={row}
                      sheet={current}
                      blocked={blocked}
                      onReview={(next) => {
                        clearFeedback(SCOPE);
                        setConfirmed(false);
                        setReview(next);
                      }}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] muted">No registered students.</p>
              )}
            </>
          )}
        </section>
      )}

      <div ref={resultRef} tabIndex={-1} className="space-y-3 outline-none">
        {review && (
          <section className={`${PANEL} space-y-2`} aria-label="Review attendance change">
            <h2 className="text-base font-semibold">Review before saving</h2>
            <p className="text-[13px]">
              {review.row.name}: {label(review.row.status)} → {label(review.status)}
            </p>
            <p className="text-[13px]">Reason: {review.reason}</p>
            {review.reversal && (
              <p role="alert" className="text-[13px] text-alert">
                This reverses a recorded check-in. The original record and kiosk receipt are kept with this correction. Any class credit already used is
                not refunded here.
              </p>
            )}
            {ATTENDED.includes(review.status) && !ATTENDED.includes(review.row.status) && (
              <p className="text-[13px] muted">Odoo checks the student’s membership and course eligibility before saving.</p>
            )}
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={confirmed} disabled={blocked} onChange={(event) => setConfirmed(event.target.checked)} />I confirmed
              this attendance change.
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={blocked || !confirmed} loading={busy} onClick={() => void confirm()}>
                Confirm attendance in Odoo
              </Button>
              <Button disabled={blocked} onClick={() => setReview(null)}>
                Cancel
              </Button>
            </div>
          </section>
        )}
        <Feedback value={feedback[SCOPE]} busy={busy} onRetry={pendingIn(SCOPE) ? () => void checkResult() : undefined} />
      </div>
    </div>
  );
}

function RowEditor({ row, sheet, blocked, onReview }: { row: Row; sheet: Sheet; blocked: boolean; onReview: (review: Review) => void }) {
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const reversal = ATTENDED.includes(row.status) && !!status && !ATTENDED.includes(status);
  const editable = sheet.session.open && (!row.logId || sheet.canReverse);
  const refused = !sheet.session.open || (reversal && !sheet.canReverse) || (!!row.logId && !sheet.canReverse);

  return (
    <li className="space-y-2 py-3" aria-label={`Attendance for ${row.name}`}>
      <div>
        <p className="text-[14px] font-semibold">{row.name}</p>
        <p className="text-[12px] muted">
          {label(row.status)}
          {row.checkedInAt ? ` · recorded ${when(row.checkedInAt)}` : ''}
          {row.creditHold ? ` · class credit ${row.creditHold}` : ''}
          {!row.registered ? ' · not on the current roster' : ''}
        </p>
        {row.corrections.map((c, index) => (
          <p key={index} className="text-[11px] muted">
            {c.actor} changed {label(c.before)} → {label(c.after)} · {when(c.at)} · {c.reason}
          </p>
        ))}
      </div>
      {editable && (
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <Field label="New status">
            <Select aria-label={`New status for ${row.name}`} value={status} disabled={blocked} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Choose</option>
              {sheet.marks
                .filter((mark) => mark !== row.status)
                .map((mark) => (
                  <option key={mark} value={mark}>
                    {label(mark)}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Reason">
            <Input aria-label={`Reason for ${row.name}`} value={reason} maxLength={500} disabled={blocked} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Button disabled={blocked || !status || !reason.trim() || refused} onClick={() => onReview({ row, status, reason: reason.trim(), reversal })}>
            Review {row.name}
          </Button>
        </div>
      )}
      {reversal && !sheet.canReverse && (
        <p role="alert" className="text-[12px] text-alert">
          Reversing recorded attendance requires a manager.
        </p>
      )}
    </li>
  );
}
