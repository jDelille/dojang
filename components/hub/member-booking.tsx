'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Field, Select } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, useHubActions, useHubRead, when } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/** Ported from Jodi's MemberBooking. */

type Session = { id: string; title: string; startsAt: string; future: boolean; version: number };
type Context = { members: { id: string; name: string }[]; sessions: Session[] };

const TEXT = 'text-[13px]';

export function MemberBooking({ memberId }: { memberId: string }) {
  return (
    <HubGate capability="bookings.write">
      <MemberBookingScreen memberId={memberId} />
    </HubGate>
  );
}

function MemberBookingScreen({ memberId }: { memberId: string }) {
  const scope = `booking:${memberId}`;
  // The hub context lists only the members and classes this staff member may see,
  // so a member ID in the URL grants no access by itself.
  const context = useHubRead<Context>('classes/upcoming');
  const [now, setNow] = useState(() => Date.now());
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(async () => {
    await context.reload();
    setNow(Date.now());
  });
  const [targetId, setTargetId] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const result = feedback[scope];
  const saved = result?.kind === 'success';
  const disabled = busy || locked || context.loading;
  const member = context.data?.members?.find((m) => m.id === memberId);
  const available = (context.data?.sessions ?? []).filter((s) => s.future && Date.parse(s.startsAt) > now);
  const target = available.find((s) => s.id === targetId);

  useEffect(() => {
    if (result) resultRef.current?.focus({ preventScroll: true });
  }, [result]);

  function choose(id: string) {
    setTargetId(id);
    setReviewing(false);
    clearFeedback(scope);
  }

  async function confirm() {
    if (!target || disabled) return;
    // Recheck at submission: the class may have started since it was chosen.
    if (Date.parse(target.startsAt) <= Date.now()) {
      setNow(Date.now());
      setReviewing(false);
      return;
    }
    await act(scope, `members/${memberId}/bookings`, { sessionId: target.id }, { expectedVersion: target.version });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {context.loading && <Notice>Loading classes from Odoo…</Notice>}
      {context.error && <Notice tone="alert">{explainHubError(context.error)}</Notice>}
      {!context.loading && !context.error && context.data && !member && (
        <Notice tone="alert">This member is unavailable for booking with your current account. No other member has been selected.</Notice>
      )}

      {member && (
        <section className={cn(PANEL, 'space-y-3')} aria-label={`Book a class for ${member.name}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Book a class for {member.name}</h2>
            <Link href={`/dashboard/contacts/${memberId}`} className="text-[13px] font-semibold underline underline-offset-4">
              Back to member
            </Link>
          </div>
          <p className={cn(TEXT, 'muted')}>
            Odoo checks membership, credits and class capacity before saving. This does not send a message or process a payment.
          </p>

          <Field label="Future class">
            <Select
              aria-label="Future class for member"
              value={targetId}
              disabled={disabled || saved}
              onChange={(event) => choose(event.target.value)}
            >
              <option value="">Choose a class</option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {when(s.startsAt)}
                </option>
              ))}
            </Select>
          </Field>
          {!available.length && <p className={TEXT}>No future classes are available in your authorized scope.</p>}

          {reviewing && target && (
            <p className={TEXT}>
              Register <strong>{member.name}</strong> for <strong>{target.title}</strong> on {when(target.startsAt)}?
            </p>
          )}
          {reviewing && !target && <Notice tone="alert">{explainHubError('SESSION_NOT_OPEN')}</Notice>}

          <div className="flex flex-wrap gap-2">
            <Button
              variant={reviewing ? 'primary' : 'secondary'}
              disabled={disabled || !target || saved}
              onClick={() => (reviewing ? void confirm() : setReviewing(true))}
            >
              {saved ? 'Booking saved' : busy && locked ? 'Saving booking…' : reviewing ? 'Confirm member booking in Odoo' : 'Review member booking'}
            </Button>
            {reviewing && !saved && (
              <Button variant="ghost" disabled={disabled} onClick={() => setReviewing(false)}>
                Cancel review
              </Button>
            )}
          </div>

          <div ref={resultRef} tabIndex={-1} aria-label={`Booking result for member ${memberId}`}>
            <Feedback value={result} busy={busy} onRetry={pendingIn(scope) ? () => void retry() : undefined} />
          </div>
        </section>
      )}
    </div>
  );
}
