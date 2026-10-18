'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Select, Textarea } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError, replacementBlockReason } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, useHubActions, useHubMe, useHubRead, when, type Act } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/** Ported from Jodi's hub/page.tsx inbox (MessageCard and Recent actions). Everything comes from the Hub `context` read. */

type Message = {
  id: string;
  text: string;
  state: string;
  summary: string;
  reply: string;
  mode: string;
  revision: number;
  channel: string;
  guardianName: string;
  contactRef: string;
  memberId: string | null;
  sessionId: string | null;
};
type Session = { id: string; title: string; startsAt: string; future: boolean; version: number };
type Context = {
  members: { id: string; name: string }[];
  sessions: Session[];
  messages: Message[];
  deliveries: { id: string; messageId: string; state: string; providerRef: string | null; approvedBy: string }[];
  capabilities: { outbound: string; inbound: string; ai: string };
  timeline: {
    id: string;
    memberId: string;
    action: string;
    actor: string;
    at: string;
    booking?: { enrollmentId: string; classTitle: string; startsAt: string; state: string; attendanceState: string } | null;
  }[];
};
type Actions = ReturnType<typeof useHubActions>;

const TEXT = 'text-[13px]';
const ROW = 'space-y-1 border-t border-[color:var(--color-border)] pt-3 first:border-t-0 first:pt-0';

export function ParentMessages() {
  return (
    <HubGate capability="inbox.use">
      <ParentMessagesScreen />
    </HubGate>
  );
}

function ParentMessagesScreen() {
  const context = useHubRead<Context>('parent-messages');
  const actions = useHubActions(context.reload);
  const data = context.data;
  const outboundReady = data?.capabilities.outbound !== 'not_configured';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {context.loading && !data && <Notice>Loading parent messages from Odoo…</Notice>}
      {!context.loading && context.error && <Notice tone="alert">{explainHubError(context.error)}</Notice>}

      {data && (
        <>
          <p className={cn(TEXT, 'muted')}>
            {outboundReady
              ? 'Replies require your review and approval before entering the delivery queue.'
              : 'Outbound messaging is not configured. Drafts can still be reviewed.'}
          </p>

          <section aria-label="Parent messages" className="space-y-4">
            {data.messages.length ? (
              data.messages.map((message) => (
                <MessageCard key={`${message.id}:${message.revision}`} message={message} data={data} actions={actions} />
              ))
            ) : (
              <div className={cn(PANEL, 'space-y-1')}>
                <h2 className="text-base font-semibold">No messages to review</h2>
                <p className={TEXT}>Messages appear here when received through your configured channel and within your assigned scope.</p>
              </div>
            )}
          </section>

          <RecentActions data={data} />
        </>
      )}
    </div>
  );
}

function MessageCard({ message, data, actions }: { message: Message; data: Context; actions: Actions }) {
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = actions;
  const me = useHubMe();
  const scope = `message-${message.id}`;
  const result = feedback[scope];
  const blocked = busy || locked;
  const now = Date.now();

  const [memberId, setMemberId] = useState(message.memberId ?? '');
  const [sessionId, setSessionId] = useState(message.sessionId ?? '');
  const [reply, setReply] = useState(message.reply);
  const resultRef = useRef<HTMLDivElement>(null);

  const memberName = data.members.find((member) => member.id === message.memberId)?.name;
  const delivery = data.deliveries.find((item) => item.messageId === message.id);
  const outboundReady = data.capabilities.outbound !== 'not_configured';

  useEffect(() => {
    if (result) resultRef.current?.focus({ preventScroll: true });
  }, [result]);

  return (
    <article className={cn(PANEL, 'space-y-3')} aria-label={`Message ${message.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className={TEXT}>{memberName || 'Needs student and class review'}</strong>
        <Badge>{message.channel}</Badge>
      </div>
      <blockquote className={cn(TEXT, 'border-s-2 border-[color:var(--color-border)] ps-3')}>{message.text}</blockquote>

      {message.state !== 'resolved' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Student">
              <Select value={memberId} disabled={blocked} onChange={(event) => setMemberId(event.target.value)}>
                <option value="">Select student</option>
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Class">
              <Select value={sessionId} disabled={blocked} onChange={(event) => setSessionId(event.target.value)}>
                <option value="">Select class</option>
                {data.sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} · {when(session.startsAt)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button
            disabled={blocked || !memberId || !sessionId}
            onClick={() =>
              void act(scope, `parent-messages/${message.id}/match`, {
                memberId,
                sessionId,
                expectedRevision: message.revision,
              })
            }
          >
            Confirm student and class
          </Button>
          {message.state === 'unmatched' && (
            <p className={cn(TEXT, 'muted')}>This sender needs a verified guardian binding before this can be confirmed.</p>
          )}
        </div>
      )}

      {message.state === 'resolved' && (
        <div className="space-y-3">
          {message.summary && (
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Instructor summary</h3>
              <p className={TEXT}>{message.summary}</p>
              <p className="text-[12px] muted">{message.mode}</p>
            </div>
          )}

          {delivery && (
            <p className={TEXT}>
              Reply {delivery.state} · approved by {delivery.approvedBy}
            </p>
          )}

          {!delivery && (
            <>
              <Button
                variant="secondary"
                disabled={blocked}
                onClick={() => void act(scope, `parent-messages/${message.id}/draft`, { expectedRevision: message.revision })}
              >
                {message.reply ? 'Regenerate draft' : 'Prepare follow-up'}
              </Button>

              {message.reply && (
                <div className="space-y-2">
                  <Field label="Review reply">
                    <Textarea value={reply} maxLength={1500} disabled={blocked} onChange={(event) => setReply(event.target.value)} />
                  </Field>
                  <p className={TEXT}>
                    Recipient: {message.guardianName || 'Verified guardian'} · {message.channel} contact {message.contactRef}. This sends a
                    reply on the verified channel. No booking or attendance change is included.
                  </p>
                  <Button
                    disabled={blocked || !reply.trim() || !outboundReady}
                    onClick={() =>
                      void act(scope, `parent-messages/${message.id}/reply`, { expectedRevision: message.revision, reply: reply.trim() })
                    }
                  >
                    Approve and queue reply
                  </Button>
                  {!outboundReady && <p className="text-[12px] muted">Messaging must be configured before a reply can be queued.</p>}
                </div>
              )}
            </>
          )}

          {me.can('bookings.write') && message.memberId && (
            <ClassChange message={message} sessions={data.sessions} memberName={memberName} now={now} act={act} scope={scope} blocked={blocked} booked={result?.kind === 'success'} clearFeedback={() => clearFeedback(scope)} />
          )}
        </div>
      )}

      <div ref={resultRef} tabIndex={-1} aria-label="Message action result">
        <Feedback value={result} busy={busy} onRetry={pendingIn(scope) ? () => void retry() : undefined} />
      </div>
    </article>
  );
}

function ClassChange({
  message,
  sessions,
  memberName,
  now,
  act,
  scope,
  blocked,
  booked,
  clearFeedback,
}: {
  message: Message;
  sessions: Session[];
  memberName?: string;
  now: number;
  act: Act;
  scope: string;
  blocked: boolean;
  booked: boolean;
  clearFeedback: () => void;
}) {
  const [bookingType, setBookingType] = useState<'book' | 'change_class'>('book');
  const [targetId, setTargetId] = useState('');
  const [review, setReview] = useState(false);

  const original = sessions.find((session) => session.id === message.sessionId);
  const replacementReason = replacementBlockReason(original, now);
  const futureSessions = sessions.filter((session) => session.future && Date.parse(session.startsAt) > now && session.id !== message.sessionId);
  const target = futureSessions.find((session) => session.id === targetId);
  const bookingBlocked = bookingType === 'change_class' && !!replacementReason;

  function confirm() {
    if (!target || !message.memberId) return;
    if (bookingType === 'book') {
      void act(scope, `members/${message.memberId}/bookings`, { sessionId: target.id }, { expectedVersion: target.version });
    } else {
      void act(
        scope,
        `members/${message.memberId}/class-change`,
        { fromSessionId: message.sessionId, sessionId: target.id },
        { expectedVersion: target.version },
      );
    }
  }

  return (
    <details className="space-y-3 rounded-control border border-[color:var(--color-border)] px-3 py-2">
      <summary className={cn(TEXT, 'cursor-pointer font-semibold')}>Book or change a class</summary>
      <div className="mt-3 space-y-3">
        <p className={TEXT}>
          Review a future class for this student. Odoo checks the subscription, credits, roster and capacity when you confirm. Existing charges
          and cancellation rules apply.
        </p>
        <Field label="Booking action">
          <Select
            value={bookingType}
            disabled={blocked}
            onChange={(event) => {
              setBookingType(event.target.value === 'change_class' ? 'change_class' : 'book');
              setReview(false);
              clearFeedback();
            }}
          >
            <option value="book">Add a class registration</option>
            <option value="change_class" disabled={!!replacementReason}>
              Replace the original registration
            </option>
          </Select>
        </Field>
        {replacementReason && <p className="text-[12px] muted">{replacementReason}</p>}
        <Field label="Target class">
          <Select
            value={targetId}
            disabled={blocked}
            onChange={(event) => {
              setTargetId(event.target.value);
              setReview(false);
              clearFeedback();
            }}
          >
            <option value="">Select future class</option>
            {futureSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} · {when(session.startsAt)}
              </option>
            ))}
          </Select>
        </Field>

        {!review ? (
          <Button variant="secondary" disabled={blocked || !target || bookingBlocked || booked} onClick={() => setReview(true)}>
            Review class change
          </Button>
        ) : (
          <div className="space-y-2">
            <p className={TEXT}>
              <strong>Review before saving:</strong> <strong>{memberName}</strong>:{' '}
              {bookingType === 'book' ? 'add a registration for' : 'replace the original class with'} <strong>{target?.title}</strong> on{' '}
              {target && when(target.startsAt)}. This records the booking in Odoo; it does not send a message.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={blocked || !target || bookingBlocked || booked} onClick={confirm}>
                {booked ? 'Booking saved' : blocked ? 'Saving booking…' : 'Confirm booking in Odoo'}
              </Button>
              <Button variant="ghost" disabled={blocked} onClick={() => setReview(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function RecentActions({ data }: { data: Context }) {
  return (
    <section className={cn(PANEL, 'space-y-3')} aria-label="Recent actions">
      <h2 className="text-base font-semibold">Recent actions</h2>
      {data.timeline.length ? (
        data.timeline.map((entry) => (
          <div key={entry.id} className={ROW}>
            <p className={TEXT}>
              {data.members.find((member) => member.id === entry.memberId)?.name} · {entry.action.replaceAll('_', ' ')} · {entry.actor} ·{' '}
              {when(entry.at)}
            </p>
            {entry.booking ? (
              <div role="group" aria-label={`Saved booking receipt ${entry.booking.enrollmentId}`} className={cn(TEXT, 'space-y-1 rounded-control border border-[color:var(--color-border)] px-3 py-2')}>
                <strong>Odoo registration receipt: {entry.booking.enrollmentId}</strong>
                <p>
                  {entry.booking.classTitle} · {when(entry.booking.startsAt)}
                </p>
                <p>
                  Current registration: {entry.booking.state}. Attendance: {entry.booking.attendanceState}.
                </p>
                <p className="text-[12px] muted">Loaded from Odoo. This booking record does not confirm that a message was sent.</p>
              </div>
            ) : (
              ['book', 'change_class'].includes(entry.action) && (
                <p className="text-[12px] muted">Receipt details unavailable. Check the registration in Odoo before booking again.</p>
              )
            )}
          </div>
        ))
      ) : (
        <p className={TEXT}>No recorded actions yet.</p>
      )}
    </section>
  );
}
