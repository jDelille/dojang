'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError, type ActionFeedback } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, preview, useHubActions, useHubRead, when } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/**
 * Ported from Jodi's CommunicationsWorkspace. Broadcasts queue inside Odoo as
 * Jodi built them; whether outbound messages should go through WhatsMax
 * instead is an open question for Jodi (see ROSTER_PORT_GUIDE.md).
 */

type Audience = { id: string; label: string };
type Broadcast = {
  id: string;
  name: string;
  channel: string;
  purpose: string;
  audience: string;
  state: string;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  scheduledAt: string | null;
  counts: Record<string, number>;
  version: number;
  body: string;
};
type BroadcastContext = {
  audiences: Audience[];
  provider: string;
  quietHours: { start: number; end: number; timeZone: string };
  broadcasts: Broadcast[];
};
type BroadcastPreview = {
  audience: string;
  recipientCount: number;
  excludedCounts: Record<string, number>;
  sample: { name: string; address: string; students: number }[];
  excludedSample: { name: string; reason: string }[];
  quietHoursStart: string | null;
  provider: string;
  reviewToken: string;
};
type Channel = { channel: string; address: string | null; nativeOptOut: boolean; service: string | null; marketing: string | null };
type Contact = {
  partnerId: string;
  name: string;
  student: boolean;
  channels: Channel[];
  history: { channel: string; purpose: string; state: string; source: string; evidence: string; by: string; at: string }[];
};
type Automation = {
  id: string;
  kind: string;
  name: string;
  module: string;
  active: boolean;
  trigger: string;
  model: string;
  nextRun?: string | null;
  sendsMessages: boolean | null;
  version: number;
};
type ConsentForm = { channel: string; purpose: string; state: string; source: string; evidence: string };
/** One write waiting for "Review before saving". */
type Review = { path: string; payload: Record<string, unknown>; expectedVersion?: number; lines: string[] };

const EXCLUDED: Record<string, string> = {
  no_contact: 'No address for this channel',
  opted_out: 'Opted out',
  no_marketing_consent: 'No marketing consent',
  consent_or_contact_changed: 'Consent or contact changed before approval',
  cancelled: 'Cancelled',
};
const PROVIDER: Record<string, { title: string; detail: string }> = {
  not_configured: {
    title: 'No messaging provider is connected',
    detail: 'Approved messages stay queued and nothing is sent.',
  },
  configured_not_exercised: {
    title: 'A provider is configured but not yet proven',
    detail: 'Messages count as sent only when the provider confirms.',
  },
};
const AUTOMATIONS_SHOWN = 5;
const EMPTY_DRAFT = { name: '', channel: 'sms', purpose: 'service', audience: '', body: '' };
const EMPTY_CONSENT: ConsentForm = { channel: 'sms', purpose: 'marketing', state: 'granted', source: 'paper_form', evidence: '' };
const TEXT = 'text-[13px]';
const ROW = 'border-b border-[color:var(--color-border)] pb-3 last:border-b-0 last:pb-0';
const SCOPE = 'messaging';

export function MessagingConsent() {
  return (
    <HubGate capability="messaging.manage">
      <MessagingConsentScreen />
    </HubGate>
  );
}

function MessagingConsentScreen() {
  const context = useHubRead<BroadcastContext>('messaging/broadcasts');
  const automations = useHubRead<{ automations: Automation[]; canManage: boolean }>('messaging/automations');
  // The hub context lists the members this staff member may see.
  const people = useHubRead<{ members: { id: string; name: string }[] }>('classes/upcoming');
  const [memberId, setMemberId] = useState('');
  const consent = useHubRead<{ contacts: Contact[] }>(memberId ? `members/${memberId}/consent` : null);

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [broadcastPreview, setBroadcastPreview] = useState<BroadcastPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [broadcastReason, setBroadcastReason] = useState('');
  // Reasons typed on each broadcast or automation row, by its id.
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [consentForms, setConsentForms] = useState<Record<string, ConsentForm>>({});
  const [showAllAutomations, setShowAllAutomations] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);

  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(async () => {
    await Promise.all([context.reload(), automations.reload(), consent.reload()]);
  });
  const result = feedback[SCOPE];
  const blocked = busy || locked;

  useEffect(() => {
    if (review || result) reviewRef.current?.focus({ preventScroll: true });
  }, [review, result]);

  function openReview(next: Review) {
    clearFeedback(SCOPE);
    setConfirmed(false);
    setReview(next);
  }

  function afterWrite(saved?: ActionFeedback) {
    if (saved?.kind === 'success' || saved?.kind === 'error') {
      setReview(null);
      setConfirmed(false);
    }
    if (saved?.kind === 'success') {
      setBroadcastPreview(null);
      setBroadcastReason('');
      setReasons({});
      setConsentForms({});
    }
  }

  async function confirm() {
    if (!review || !confirmed || blocked) return;
    afterWrite(await act(SCOPE, review.path, review.payload, { expectedVersion: review.expectedVersion }));
  }

  function setDraftField(field: keyof typeof EMPTY_DRAFT, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setBroadcastPreview(null);
  }

  async function loadBroadcastPreview() {
    setPreviewError('');
    try {
      setBroadcastPreview(
        await preview<BroadcastPreview>('messaging/broadcasts/preview', {
          channel: draft.channel,
          purpose: draft.purpose,
          audience: draft.audience,
          body: draft.body,
        }),
      );
    } catch (error) {
      setBroadcastPreview(null);
      setPreviewError(explainHubError((error as Error).message));
    }
  }

  function reviewNewBroadcast() {
    if (!broadcastPreview) return;
    openReview({
      path: 'messaging/broadcasts',
      payload: {
        channel: draft.channel,
        purpose: draft.purpose,
        audience: draft.audience,
        body: draft.body,
        name: draft.name.trim(),
        reason: broadcastReason.trim(),
        reviewToken: broadcastPreview.reviewToken,
      },
      lines: [
        `${draft.name.trim()}: ${draft.channel.toUpperCase()} ${draft.purpose} to ${broadcastPreview.recipientCount} recipients in ${broadcastPreview.audience}.`,
        `“${draft.body.trim()}”`,
        'Saves the frozen recipient list for approval. Nothing is queued or sent yet.',
      ],
    });
  }

  function reviewApproval(broadcast: Broadcast) {
    openReview({
      path: `messaging/broadcasts/${broadcast.id}/approval`,
      expectedVersion: broadcast.version,
      payload: { reason: (reasons[broadcast.id] ?? '').trim() },
      lines: [
        `Approve ${broadcast.name} to ${broadcast.counts.queued ?? 0} recipients.`,
        `“${broadcast.body}”`,
        'Consent and contacts are checked again now. Messages are queued for the provider; they count as sent only when the provider confirms.',
      ],
    });
  }

  function reviewCancellation(broadcast: Broadcast) {
    openReview({
      path: `messaging/broadcasts/${broadcast.id}/cancellation`,
      expectedVersion: broadcast.version,
      payload: { reason: (reasons[broadcast.id] ?? '').trim() },
      lines: [`Cancel ${broadcast.name}. Queued recipients are removed; nothing is sent.`],
    });
  }

  function consentFormFor(partnerId: string) {
    return consentForms[partnerId] ?? EMPTY_CONSENT;
  }

  function setConsentField(partnerId: string, field: keyof ConsentForm, value: string) {
    setConsentForms((previous) => ({ ...previous, [partnerId]: { ...consentFormFor(partnerId), [field]: value } }));
  }

  function reviewConsent(contact: Contact) {
    const form = consentFormFor(contact.partnerId);
    openReview({
      path: `members/${memberId}/consent`,
      payload: {
        partnerId: contact.partnerId,
        channel: form.channel,
        purpose: form.purpose,
        state: form.state,
        source: form.source,
        evidence: form.evidence.trim(),
      },
      lines: [
        `${contact.name}: ${form.channel.toUpperCase()} ${form.purpose} consent ${form.state} (${form.source.replace('_', ' ')}).`,
        `Evidence: ${form.evidence.trim()}`,
        form.purpose === 'marketing'
          ? 'Marketing consent also updates Odoo’s native opt-out list for this address.'
          : 'Service consent applies to Companion broadcasts.',
        'No message is sent.',
      ],
    });
  }

  function reviewAutomation(automation: Automation) {
    openReview({
      path: 'messaging/automations/state',
      expectedVersion: automation.version,
      payload: { automationId: automation.id, active: !automation.active, reason: (reasons[automation.id] ?? '').trim() },
      lines: [
        `${automation.active ? 'Pause' : 'Resume'} ${automation.name}.`,
        automation.active ? 'It will not run until an owner resumes it.' : 'It will run again on its native trigger.',
      ],
    });
  }

  const provider = context.data ? PROVIDER[context.data.provider] : undefined;
  const automationList = automations.data?.automations ?? [];
  const shownAutomations = showAllAutomations ? automationList : automationList.slice(0, AUTOMATIONS_SHOWN);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className={cn(PANEL, 'space-y-2')}>
        <p className={TEXT}>
          Broadcasts are reviewed, frozen to a consented audience and approved before anything is queued. Consent is recorded with its source and
          kept as history.
        </p>
        {context.data && (
          <div role="status" className={cn(TEXT, 'space-y-1 rounded-control border border-warning/50 px-3 py-2')}>
            {provider && <p className="font-semibold">{provider.title}</p>}
            <p>
              {provider?.detail} Quiet hours {context.data.quietHours.start}:00–{context.data.quietHours.end}:00 ({context.data.quietHours.timeZone}):
              approvals inside them are scheduled for {context.data.quietHours.end}:00.
            </p>
          </div>
        )}
      </section>

      {/* Broadcasts */}
      <section className={cn(PANEL, 'space-y-4')} aria-label="Broadcast">
        <h2 className="text-base font-semibold">New broadcast</h2>
        {context.loading && <Notice>Loading broadcasts from Odoo…</Notice>}
        {!context.loading && context.error && <Notice tone="alert">{explainHubError(context.error)}</Notice>}
        {context.data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Broadcast name">
                <Input value={draft.name} maxLength={120} disabled={blocked} onChange={(event) => setDraftField('name', event.target.value)} />
              </Field>
              <Field label="Audience">
                <Select value={draft.audience} disabled={blocked} onChange={(event) => setDraftField('audience', event.target.value)}>
                  <option value="">Choose</option>
                  {context.data.audiences.map((audience) => (
                    <option key={audience.id} value={audience.id}>
                      {audience.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Channel">
                <Select value={draft.channel} disabled={blocked} onChange={(event) => setDraftField('channel', event.target.value)}>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </Select>
              </Field>
              <Field label="Purpose">
                <Select value={draft.purpose} disabled={blocked} onChange={(event) => setDraftField('purpose', event.target.value)}>
                  <option value="service">Service notice (classes, closures)</option>
                  <option value="marketing">Marketing (needs consent)</option>
                </Select>
              </Field>
            </div>
            <Field label="Message">
              <Textarea
                value={draft.body}
                rows={4}
                maxLength={draft.channel === 'email' ? 5000 : 1000}
                disabled={blocked}
                onChange={(event) => setDraftField('body', event.target.value)}
              />
            </Field>
            <p className={cn(TEXT, 'muted')}>{draft.body.length} characters</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" disabled={blocked || !draft.audience || !draft.body.trim()} onClick={() => void loadBroadcastPreview()}>
                Preview audience
              </Button>
              {(!draft.audience || !draft.body.trim()) && <span className={cn(TEXT, 'muted')}>Add an audience and message to preview.</span>}
            </div>
            {previewError && <Notice tone="alert">{previewError}</Notice>}

            {broadcastPreview && (
              <div className={cn(TEXT, 'space-y-2')} aria-label="Broadcast preview">
                <p>
                  {broadcastPreview.recipientCount} recipients in {broadcastPreview.audience}.
                </p>
                {Object.entries(broadcastPreview.excludedCounts).map(([key, count]) => (
                  <p key={key}>
                    {count} excluded: {EXCLUDED[key] ?? key}
                  </p>
                ))}
                {broadcastPreview.sample.map((sample, index) => (
                  <p key={index} className="muted">
                    {sample.name} · {sample.address}
                    {sample.students > 1 ? ` · ${sample.students} students` : ''}
                  </p>
                ))}
                {broadcastPreview.quietHoursStart && (
                  <p>It is quiet hours now; if approved now it is scheduled for {when(broadcastPreview.quietHoursStart)}.</p>
                )}
                <Field label="Reason for this broadcast">
                  <Input
                    value={broadcastReason}
                    maxLength={500}
                    disabled={blocked}
                    onChange={(event) => setBroadcastReason(event.target.value)}
                  />
                </Field>
                <Button
                  variant="secondary"
                  disabled={blocked || !broadcastPreview.recipientCount || !broadcastReason.trim() || !draft.name.trim()}
                  onClick={reviewNewBroadcast}
                >
                  Review broadcast
                </Button>
              </div>
            )}

            {context.data.broadcasts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[13px] font-semibold">Recent broadcasts</h3>
                {context.data.broadcasts.map((broadcast) => (
                  <div key={broadcast.id} role="group" aria-label={`Broadcast ${broadcast.name}`} className={cn(TEXT, ROW, 'space-y-1')}>
                    <p className="font-semibold">
                      {broadcast.name} · {broadcast.state.replace('_', ' ')}
                    </p>
                    <p className="muted">
                      {broadcast.channel.toUpperCase()} {broadcast.purpose} · {broadcast.audience} · by {broadcast.createdBy}
                      {broadcast.approvedBy ? ` · approved by ${broadcast.approvedBy}` : ''}
                      {broadcast.scheduledAt ? ` · scheduled ${when(broadcast.scheduledAt)}` : ''}
                    </p>
                    <p className="muted">
                      {Object.entries(broadcast.counts)
                        .map(([key, count]) => `${count} ${key}`)
                        .join(' · ')}
                    </p>
                    {broadcast.state !== 'cancelled' && (
                      <div className="flex flex-wrap items-end gap-2 pt-1">
                        <div className="min-w-[200px] flex-1">
                          <Field label="Reason">
                            <Input
                              aria-label={`Reason for ${broadcast.name}`}
                              value={reasons[broadcast.id] ?? ''}
                              maxLength={500}
                              disabled={blocked}
                              onChange={(event) => setReasons((previous) => ({ ...previous, [broadcast.id]: event.target.value }))}
                            />
                          </Field>
                        </div>
                        {broadcast.state === 'awaiting_approval' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={blocked || !(reasons[broadcast.id] ?? '').trim()}
                            onClick={() => reviewApproval(broadcast)}
                          >
                            Review approval
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={blocked || !(reasons[broadcast.id] ?? '').trim()}
                          onClick={() => reviewCancellation(broadcast)}
                        >
                          Review cancellation
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Consent */}
      <section className={cn(PANEL, 'space-y-4')} aria-label="Consent">
        <h2 className="text-base font-semibold">Consent</h2>
        {people.error && <Notice tone="alert">{explainHubError(people.error)}</Notice>}
        <Field label="Student">
          <Select
            aria-label="Student for consent"
            value={memberId}
            disabled={blocked || people.loading}
            onChange={(event) => {
              setMemberId(event.target.value);
              setConsentForms({});
            }}
          >
            <option value="">Choose a student</option>
            {(people.data?.members ?? []).map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>
        {memberId && consent.loading && <Notice>Loading consent from Odoo…</Notice>}
        {memberId && !consent.loading && consent.error && <Notice tone="alert">{explainHubError(consent.error)}</Notice>}

        {memberId &&
          !consent.loading &&
          consent.data?.contacts.map((contact) => {
            const form = consentFormFor(contact.partnerId);
            return (
              <div key={contact.partnerId} role="group" aria-label={`Consent for ${contact.name}`} className={cn(TEXT, ROW, 'space-y-3')}>
                <div className="flex items-center gap-2">
                  <strong>{contact.name}</strong>
                  {contact.student && <Badge>Student</Badge>}
                </div>
                <ul className="space-y-1">
                  {contact.channels.map((channel) => (
                    <li key={channel.channel} className="flex flex-wrap items-center gap-2">
                      <span className="w-[70px] font-semibold">{channel.channel.toUpperCase()}</span>
                      <span className="min-w-[160px] muted">{channel.address || 'No address'}</span>
                      <Badge>Service: {channel.service || 'not recorded'}</Badge>
                      <Badge>Marketing: {channel.marketing || 'not recorded'}</Badge>
                      {channel.nativeOptOut && <Badge>Opted out in Odoo</Badge>}
                    </li>
                  ))}
                </ul>
                {contact.history.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-[12px] font-semibold">History</p>
                    {contact.history.map((entry, index) => (
                      <p key={index} className="text-[12px] muted">
                        {entry.by} recorded {entry.channel} {entry.purpose} {entry.state} ({entry.source}) · {when(entry.at)} · {entry.evidence}
                      </p>
                    ))}
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-4">
                  <Field label="Channel">
                    <Select
                      aria-label={`Consent channel for ${contact.name}`}
                      value={form.channel}
                      disabled={blocked}
                      onChange={(event) => setConsentField(contact.partnerId, 'channel', event.target.value)}
                    >
                      <option value="sms">SMS</option>
                      <option value="email">Email</option>
                      <option value="whatsapp">WhatsApp</option>
                    </Select>
                  </Field>
                  <Field label="Purpose">
                    <Select
                      aria-label={`Consent purpose for ${contact.name}`}
                      value={form.purpose}
                      disabled={blocked}
                      onChange={(event) => setConsentField(contact.partnerId, 'purpose', event.target.value)}
                    >
                      <option value="marketing">Marketing</option>
                      <option value="service">Service notices</option>
                    </Select>
                  </Field>
                  <Field label="Decision">
                    <Select
                      aria-label={`Consent decision for ${contact.name}`}
                      value={form.state}
                      disabled={blocked}
                      onChange={(event) => setConsentField(contact.partnerId, 'state', event.target.value)}
                    >
                      <option value="granted">Granted</option>
                      <option value="withdrawn">Withdrawn</option>
                    </Select>
                  </Field>
                  <Field label="Source">
                    <Select
                      aria-label={`Consent source for ${contact.name}`}
                      value={form.source}
                      disabled={blocked}
                      onChange={(event) => setConsentField(contact.partnerId, 'source', event.target.value)}
                    >
                      <option value="paper_form">Paper form</option>
                      <option value="in_person">In person</option>
                      <option value="web_form">Web form</option>
                      <option value="verbal">Verbal</option>
                      <option value="reply_stop">Replied STOP</option>
                    </Select>
                  </Field>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
                    <Field label="Evidence">
                      <Input
                        aria-label={`Consent evidence for ${contact.name}`}
                        value={form.evidence}
                        maxLength={500}
                        disabled={blocked}
                        onChange={(event) => setConsentField(contact.partnerId, 'evidence', event.target.value)}
                      />
                    </Field>
                  </div>
                  <Button size="sm" variant="secondary" disabled={blocked || !form.evidence.trim()} onClick={() => reviewConsent(contact)}>
                    Review consent change
                  </Button>
                </div>
              </div>
            );
          })}
      </section>

      {/* Automations */}
      <section className={cn(PANEL, 'space-y-3')} aria-label="Automations">
        <h2 className="text-base font-semibold">Automations</h2>
        <p className={cn(TEXT, 'muted')}>
          Native Odoo rules and scheduled jobs from the dojo modules. Pausing stops them from running until resumed. Only an owner can pause or
          resume.
        </p>
        {automations.loading && <Notice>Loading automations from Odoo…</Notice>}
        {!automations.loading && automations.error && <Notice tone="alert">{explainHubError(automations.error)}</Notice>}
        {shownAutomations.map((automation) => (
          <div key={automation.id} role="group" aria-label={`Automation ${automation.name}`} className={cn(TEXT, ROW, 'space-y-2')}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{automation.name}</strong>
                  <Badge>{automation.active ? 'Running' : 'Paused'}</Badge>
                </div>
                <p className="muted">
                  {automation.kind} · {automation.module} · {automation.model} · {automation.trigger}
                  {automation.sendsMessages ? ' · Sends messages' : ''}
                </p>
              </div>
              {automation.nextRun && <p className="muted">Next {when(automation.nextRun)}</p>}
            </div>
            {automations.data?.canManage && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <Field label="Reason">
                    <Input
                      aria-label={`Reason for ${automation.name}`}
                      value={reasons[automation.id] ?? ''}
                      maxLength={500}
                      disabled={blocked}
                      onChange={(event) => setReasons((previous) => ({ ...previous, [automation.id]: event.target.value }))}
                    />
                  </Field>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={blocked || !(reasons[automation.id] ?? '').trim()}
                  onClick={() => reviewAutomation(automation)}
                >
                  {automation.active ? 'Review pause' : 'Review resume'}
                </Button>
              </div>
            )}
          </div>
        ))}
        {automations.data && !automationList.length && <p className={TEXT}>No dojo automations found.</p>}
        {automationList.length > AUTOMATIONS_SHOWN && (
          <Button size="sm" variant="ghost" aria-expanded={showAllAutomations} onClick={() => setShowAllAutomations((value) => !value)}>
            {showAllAutomations ? 'Show fewer' : `Show all ${automationList.length} automations`}
          </Button>
        )}
      </section>

      {/* Review before saving, and the result */}
      <div ref={reviewRef} tabIndex={-1} aria-label="Communications result" className="space-y-4">
        {review && (
          <section className={cn(PANEL, 'space-y-3')} aria-label="Review communications action">
            <h2 className="text-base font-semibold">Review before saving</h2>
            {review.lines.map((line, index) => (
              <p key={index} className={TEXT}>
                {line}
              </p>
            ))}
            <label className={cn(TEXT, 'flex items-start gap-2')}>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                disabled={blocked}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I reviewed this action.
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={blocked || !confirmed} onClick={() => void confirm()}>
                {busy ? 'Saving…' : 'Confirm communications action in Odoo'}
              </Button>
              <Button variant="ghost" disabled={blocked} onClick={() => setReview(null)}>
                Cancel
              </Button>
            </div>
          </section>
        )}
        <Feedback value={result} busy={busy} onRetry={pendingIn(SCOPE) ? () => void retry().then(afterWrite) : undefined} />
      </div>
    </div>
  );
}
