'use client';

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError, type ActionFeedback } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, money, preview, useHubActions, useHubMe, useHubRead, when } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/** Ported from Jodi's MemberManagement (with the family part of ConnectedMemberDetails and SetupChecklist's ChecklistItems). */

type Session = { id: string; title: string; startsAt: string; future: boolean; version: number };
type Details = {
  member: {
    id: string;
    name: string;
    version: number;
    partnerVersion: number;
    phone: string | null;
    email: string | null;
    dateOfBirth?: string | null;
    photo?: string | null;
    state: string;
    rank: string;
    stripes: number;
  };
  canEdit: boolean;
  canEditContact: boolean;
  courses?: { id: string; name: string }[];
  ranks: { id: string; name: string; maxStripes: number }[];
  rankHistory: { id: string; rank: string; stripes: number; date: string }[];
  bookings: { id: string; sessionId: string; title: string; startsAt: string; attendanceState: string; replaceable: boolean }[];
  attendance: { id: string; sessionId: string; title: string; checkedInAt: string; checkedOutAt: string | null }[];
  billing: null | {
    subscriptions: { id: string; plan: string; state: string; nextInvoiceDate: string | null }[];
    invoices: {
      id: string;
      number: string;
      kind: string;
      date: string | null;
      paymentState: string;
      total: number;
      remaining: number;
      currency: string;
      scope: string;
      version: number;
      paymentUnavailable: string | null;
    }[];
  };
};

/** One write the user is reviewing before it goes to Odoo. `path` is under /api/v2. */
type Review = { path: string; payload: Record<string, unknown>; expectedVersion?: number; description: string; archive?: boolean; checkoutLink?: boolean };
type Prepare = (review: Review) => void;
type FormProps = { data: Details; disabled: boolean; review: Prepare };

const TEXT = 'text-[13px]';
const ROW = 'space-y-1 border-t border-[color:var(--color-border)] pt-3 first:border-t-0 first:pt-0';

export function MemberManagement({ memberId, section }: { memberId: string; section?: string }) {
  return (
    <HubGate capability="members.read">
      <MemberManagementScreen memberId={memberId} section={section} />
    </HubGate>
  );
}

function MemberManagementScreen({ memberId, section }: { memberId: string; section?: string }) {
  const router = useRouter();
  const me = useHubMe();
  const scope = `member:${memberId}`;
  const details = useHubRead<Details>(`members/${memberId}/details`);
  const upcoming = useHubRead<{ sessions: Session[] }>('classes/upcoming');
  // Bumped after every saved write so the sections that load their own records reload them.
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(async () => {
    await details.reload();
    setRevision((value) => value + 1);
    setNow(Date.now());
  });
  const [review, setReview] = useState<Review | null>(null);
  const [replacement, setReplacement] = useState('');
  const reviewRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);

  const data = details.data && details.data.member?.id === memberId ? details.data : null;
  const disabled = busy || locked || details.loading;
  const formDisabled = disabled || Boolean(review);
  const result = feedback[scope];

  useEffect(() => {
    if (review) reviewRef.current?.focus();
  }, [review]);

  function refresh() {
    setReview(null);
    clearFeedback(scope);
    setNow(Date.now());
    setRevision((value) => value + 1);
    void details.reload().catch(() => undefined);
  }

  function prepare(value: Review) {
    if (disabled) return;
    clearFeedback(scope);
    setReview(value);
  }

  async function confirm() {
    if (!review || disabled || submitting.current) return;
    submitting.current = true;
    try {
      const outcome = await act(scope, review.path, review.payload, { expectedVersion: review.expectedVersion });
      if (outcome?.kind === 'success' && review.archive) router.push('/dashboard/contacts');
      else if (outcome?.kind === 'success' || outcome?.kind === 'error') setReview(null);
    } finally {
      submitting.current = false;
    }
  }

  async function checkOriginal() {
    const outcome = await retry();
    if (outcome?.kind === 'success') {
      if (review?.archive) router.push('/dashboard/contacts');
      else setReview(null);
    }
  }

  const futureSessions = (upcoming.data?.sessions ?? []).filter((s) => s.future && Date.parse(s.startsAt) > now);
  const target = futureSessions.find((s) => s.id === replacement);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section className={cn(PANEL, 'flex flex-wrap items-center justify-between gap-3')}>
        <div>
          <h2 className="text-base font-semibold">{data ? `Manage ${data.member.name}` : 'Member management'}</h2>
          {data && (
            <p className={cn(TEXT, 'muted')}>
              {data.member.state} · {data.member.rank} · {data.member.stripes} stripes
              {data.member.dateOfBirth && <> · Born {data.member.dateOfBirth}</>}
            </p>
          )}
        </div>
        <Button size="sm" disabled={disabled} onClick={refresh}>
          Refresh member details
        </Button>
      </section>

      {details.loading && <Notice>Loading this member’s Odoo records…</Notice>}
      {details.error && <Notice tone="alert">{explainHubError(details.error)} No other member’s details have been substituted.</Notice>}
      {!details.loading && !details.error && details.data && !data && (
        <Notice tone="alert">{explainHubError('MEMBER_DETAILS_UNAVAILABLE')} No other member’s details have been substituted.</Notice>
      )}

      <Feedback value={result} busy={busy} onRetry={pendingIn(scope) ? () => void checkOriginal() : undefined} />
      {result?.checkout && data && <CheckoutLink feedback={result} data={data} loading={details.loading} />}

      {data && !details.loading && (
        <>
          {review && (
            <div ref={reviewRef} tabIndex={-1} role="group" aria-label="Review member action" className={cn(PANEL, 'space-y-2 border-accent/50')}>
              <h3 className="font-semibold">Review before saving</h3>
              <p className={TEXT}>{review.description}</p>
              <p className={cn(TEXT, 'muted')}>No message will be sent and no payment will be collected.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant={review.archive ? 'danger' : 'primary'} disabled={disabled} onClick={() => void confirm()}>
                  {review.checkoutLink ? 'Prepare secure checkout' : review.archive ? 'Confirm archive in Odoo' : 'Confirm member action in Odoo'}
                </Button>
                <Button variant="ghost" disabled={disabled} onClick={() => setReview(null)}>
                  Cancel review
                </Button>
              </div>
            </div>
          )}

          {data.canEdit && (
            <Section title="Onboarding checklist" open={section === 'onboarding'}>
              <OnboardingStatus key={revision} memberId={memberId} />
            </Section>
          )}

          <Section title="Contact details" open={!section || section === 'profile'}>
            {data.canEditContact ? (
              <ContactForm key={`${data.member.version}:${data.member.partnerVersion}`} data={data} disabled={formDisabled} review={prepare} />
            ) : (
              <p className={TEXT}>
                {data.canEdit
                  ? 'This contact is shared or outside the site’s company. An administrator must review it in Odoo before editing.'
                  : 'Only a manager or owner can edit contact details.'}
              </p>
            )}
          </Section>

          <Section title="Photo" open={section === 'photo'}>
            <PhotoForm data={data} disabled={formDisabled} review={prepare} />
          </Section>

          {data.canEdit && data.courses && (
            <Section title="Courses" open={section === 'courses'}>
              {data.courses.length ? (
                data.courses.map((course) => (
                  <p key={course.id} className={TEXT}>
                    {course.name}
                  </p>
                ))
              ) : (
                <p className={TEXT}>Not on any course roster.</p>
              )}
            </Section>
          )}

          <Section title="Household and guardians" open={section === 'family'}>
            {data.canEdit ? <FamilyRecords key={revision} memberId={memberId} /> : <p className={TEXT}>Family and guardian details require manager or owner access.</p>}
          </Section>

          <Section title="Membership and billing" open={section === 'billing' || section === 'membership'}>
            <Billing data={data} disabled={formDisabled} review={prepare} />
          </Section>

          <Section title="Registrations and class changes" open={section === 'bookings'}>
            <p className={TEXT}>Active registrations for upcoming or ongoing classes (up to 100).</p>
            {upcoming.error && <Notice tone="alert">{explainHubError(upcoming.error)}</Notice>}
            <Field label="Replacement class">
              <Select aria-label="Replacement class for member" value={replacement} disabled={formDisabled} onChange={(event) => setReplacement(event.target.value)}>
                <option value="">Choose future replacement</option>
                {futureSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} · {when(s.startsAt)}
                  </option>
                ))}
              </Select>
            </Field>
            {data.bookings.length ? (
              data.bookings.map((booking) => (
                <div key={booking.id} className={ROW}>
                  <strong className={TEXT}>{booking.title}</strong>
                  <p className={cn(TEXT, 'muted')}>
                    {when(booking.startsAt)} · {booking.attendanceState}
                  </p>
                  {booking.replaceable && Date.parse(booking.startsAt) > now ? (
                    <Button
                      size="sm"
                      disabled={formDisabled || !target || target.id === booking.sessionId}
                      onClick={() => {
                        if (!target) return;
                        prepare({
                          path: `members/${memberId}/class-change`,
                          payload: { fromSessionId: booking.sessionId, sessionId: target.id },
                          expectedVersion: target.version,
                          description: `Replace ${data.member.name}’s ${booking.title} (${when(booking.startsAt)}) with ${target.title} (${when(target.startsAt)}). Existing cancellation and eligibility rules apply.`,
                        });
                      }}
                    >
                      Review replacement of {booking.title}
                    </Button>
                  ) : (
                    <p className="text-[12px] muted">This registration cannot be replaced here after the class starts or attendance is recorded.</p>
                  )}
                </div>
              ))
            ) : (
              <p className={TEXT}>No active registrations found.</p>
            )}
          </Section>

          <Section title="Attendance and checkout" open={section === 'attendance'}>
            {data.attendance.length ? (
              data.attendance.map((record) => (
                <div key={record.id} className={ROW}>
                  <strong className={TEXT}>{record.title}</strong>
                  <p className={cn(TEXT, 'muted')}>Checked in: {when(record.checkedInAt)}</p>
                  {record.checkedOutAt ? (
                    <p className={cn(TEXT, 'muted')}>Checked out: {when(record.checkedOutAt)}</p>
                  ) : (
                    <Button
                      size="sm"
                      disabled={formDisabled || !me.can('attendance.mark')}
                      onClick={() =>
                        prepare({
                          path: `members/${memberId}/class-checkout`,
                          payload: { sessionId: record.sessionId },
                          description: `Record checkout now for ${data.member.name} from ${record.title}, checked in ${when(record.checkedInAt)}.`,
                        })
                      }
                    >
                      Review checkout from {record.title}
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <p className={TEXT}>No present or late attendance records found.</p>
            )}
            <p className="text-[12px] muted">Most recent 30 attendance records within your access.</p>
          </Section>

          {data.canEdit && (
            <Section title="Waiver signing" open={section === 'waiver'}>
              <WaiverForm key={revision} data={data} disabled={formDisabled} review={prepare} />
            </Section>
          )}
          {data.canEdit && (
            <Section title="Settlement and refunds" open={section === 'refunds'}>
              <RefundsForm key={revision} data={data} disabled={formDisabled} review={prepare} />
            </Section>
          )}
          {data.canEdit && (
            <Section title="Guardian kiosk access" open={section === 'kiosk'}>
              <GuardianKioskForm key={revision} data={data} disabled={formDisabled} review={prepare} />
            </Section>
          )}
          {data.canEdit && me.can('members.archive') && (
            <Section title="Archive student" open={section === 'archive'}>
              <ArchiveForm key={revision} data={data} disabled={formDisabled} review={prepare} />
            </Section>
          )}

          <Section title="Rank and progress" open={section === 'progress'}>
            {data.rankHistory.length ? (
              data.rankHistory.map((award) => (
                <p key={award.id} className={TEXT}>
                  {award.date} · {award.rank} · {award.stripes} stripes
                </p>
              ))
            ) : (
              <p className={TEXT}>No rank history recorded.</p>
            )}
            <p className="text-[12px] muted">Most recent 20 awards.</p>
            {data.canEdit && <RankForm key={data.member.version} data={data} disabled={formDisabled} review={prepare} />}
          </Section>
        </>
      )}
    </div>
  );
}

/** A collapsible panel. Its contents mount only while open, so sections that load records load them on demand. */
function Section({ title, open: startOpen, children }: { title: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(Boolean(startOpen));
  return (
    <details className={PANEL} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold">{title}</summary>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </details>
  );
}

/** The checkout link from payment_link, shown only while the invoice still matches what was reviewed. */
function CheckoutLink({ feedback, data, loading }: { feedback: ActionFeedback; data: Details; loading: boolean }) {
  const checkout = feedback.checkout;
  if (!checkout || loading) return null;
  const stillCurrent = data.billing?.invoices.some(
    (invoice) => invoice.id === checkout.invoiceId && invoice.remaining === checkout.amount && invoice.paymentUnavailable === null,
  );
  if (!stillCurrent) return <Notice>Refresh and review the current invoice before continuing to checkout.</Notice>;
  return (
    <div className={cn(PANEL, 'space-y-1', TEXT)}>
      <p>
        {checkout.invoiceNumber} · {money(checkout.amount, checkout.currency)}
      </p>
      <a href={checkout.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="font-semibold underline underline-offset-4">
        Continue to secure invoice checkout →
      </a>
      <p className="muted">Complete payment on the secure checkout page, then refresh member details to see the confirmed Odoo balance.</p>
    </div>
  );
}

function ContactForm({ data, disabled, review }: FormProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const changes: Record<string, string> = {};
    for (const field of ['name', 'phone', 'email'] as const) {
      const value = String(form.get(field) || '').trim();
      if (value !== (data.member[field] || '')) changes[field] = value;
    }
    if (!Object.keys(changes).length) return;
    const summary = Object.entries(changes)
      .map(([key, value]) => `${key} → ${value || 'clear this field'}`)
      .join('; ');
    review({
      path: `members/${data.member.id}/profile`,
      payload: { expectedPartnerVersion: data.member.partnerVersion, changes },
      expectedVersion: data.member.version,
      description: `Update ${data.member.name}: ${summary}.`,
    });
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <Field label="Name">
        <Input name="name" aria-label="Member name" defaultValue={data.member.name} maxLength={200} required disabled={disabled} />
      </Field>
      <Field label="Email">
        <Input name="email" aria-label="Member email" type="email" defaultValue={data.member.email || ''} maxLength={200} disabled={disabled} />
      </Field>
      <Field label="Phone">
        <Input name="phone" aria-label="Member phone" type="tel" defaultValue={data.member.phone || ''} maxLength={200} disabled={disabled} />
      </Field>
      <Button type="submit" size="sm" disabled={disabled}>
        Review profile changes
      </Button>
    </form>
  );
}

/** Shrinks a chosen photo to at most 512px as a JPEG, the same limits as Jodi's. */
async function resizedPhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('PHOTO_TYPE_UNSUPPORTED');
  if (file.size > 15 * 1024 * 1024) throw Error('PHOTO_TOO_LARGE');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw Error('PHOTO_INVALID');
  });
  if (Math.min(bitmap.width, bitmap.height) < 64) throw Error('PHOTO_DIMENSIONS');
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const encoded = canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || '';
  if (!encoded || encoded.length > 400000) throw Error('PHOTO_TOO_LARGE');
  return { encoded, width: canvas.width, height: canvas.height };
}

function PhotoForm({ data, disabled, review }: FormProps) {
  const [error, setError] = useState('');
  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      const photo = await resizedPhoto(file);
      review({
        path: `members/${data.member.id}/photo`,
        payload: { image: photo.encoded },
        expectedVersion: data.member.version,
        description: `Save a new photo for ${data.member.name} (${photo.width}×${photo.height} JPEG). It replaces the current Odoo contact photo.`,
      });
    } catch (problem) {
      setError(explainHubError(problem instanceof Error ? problem.message : 'PHOTO_INVALID'));
    }
  }
  return (
    <div className="space-y-3">
      {data.member.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.member.photo} alt={`Current photo of ${data.member.name}`} width={96} height={96} className="h-24 w-24 rounded-control object-cover" />
      ) : (
        <p className={TEXT}>No photo on file.</p>
      )}
      <Field label="Choose a new photo">
        <Input type="file" aria-label="Choose a new photo" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={(event) => void choose(event)} />
      </Field>
      {data.member.photo && (
        <Button
          size="sm"
          disabled={disabled}
          onClick={() =>
            review({
              path: `members/${data.member.id}/photo`,
              payload: { image: null },
              expectedVersion: data.member.version,
              description: `Remove ${data.member.name}’s photo from the Odoo contact.`,
            })
          }
        >
          Review photo removal
        </Button>
      )}
      {error && <Notice tone="alert">{error}</Notice>}
    </div>
  );
}

function Billing({ data, disabled, review }: FormProps) {
  if (!data.billing) return <p className={TEXT}>Billing is visible only to managers and owners.</p>;
  return (
    <>
      <p className={TEXT}>
        Invoices linked to this member’s subscriptions. Review an unpaid invoice to continue to secure checkout. Refresh after payment for the current balance.
      </p>
      {data.billing.subscriptions.length ? (
        data.billing.subscriptions.map((subscription) => (
          <div key={subscription.id} className={ROW}>
            <strong className={TEXT}>{subscription.plan}</strong>
            <p className={cn(TEXT, 'muted')}>
              {subscription.state}
              {subscription.nextInvoiceDate ? ` · Next invoice date: ${subscription.nextInvoiceDate}` : ' · Next invoice date unavailable'}
            </p>
          </div>
        ))
      ) : (
        <p className={TEXT}>No linked subscriptions found.</p>
      )}
      <h3 className="font-semibold">Posted invoices and credit notes</h3>
      {data.billing.invoices.length ? (
        data.billing.invoices.map((invoice) => (
          <div key={invoice.id} className={ROW}>
            <strong className={TEXT}>
              {invoice.number}
              {invoice.kind === 'out_refund' ? ' · Credit note' : ''}
            </strong>
            <p className={cn(TEXT, 'muted')}>
              {invoice.date || 'Date unavailable'} · {invoice.paymentState.replaceAll('_', ' ')}
            </p>
            <p className={TEXT}>
              Total {money(invoice.total, invoice.currency)} · Remaining {money(invoice.remaining, invoice.currency)}
            </p>
            {invoice.scope === 'household' && <p className={cn(TEXT, 'muted')}>Shared household invoice. These are whole-invoice amounts, not this member’s individual balance.</p>}
            {invoice.paymentUnavailable === null ? (
              <Button
                size="sm"
                disabled={disabled}
                onClick={() =>
                  review({
                    path: `members/${data.member.id}/invoice-checkout`,
                    payload: { invoiceId: invoice.id, expectedAmount: invoice.remaining },
                    expectedVersion: invoice.version,
                    checkoutLink: true,
                    description: `Prepare secure checkout for invoice ${invoice.number}: ${money(invoice.remaining, invoice.currency)}${invoice.scope === 'household' ? ' for the whole household invoice' : ''}. The payer reviews and submits payment on Odoo’s checkout page.`,
                  })
                }
              >
                Review payment for {invoice.number}
              </Button>
            ) : (
              invoice.remaining > 0 &&
              invoice.kind === 'out_invoice' && <p className={cn(TEXT, 'muted')}>{explainHubError(invoice.paymentUnavailable || 'PAYMENT_SETUP_REQUIRED')}</p>
            )}
          </div>
        ))
      ) : (
        <p className={TEXT}>No posted invoices linked to these subscriptions. This does not establish a zero balance.</p>
      )}
      <p className="text-[12px] muted">Up to 50 subscriptions and 50 linked posted invoices. Next invoice date is not a confirmed payment date.</p>
    </>
  );
}

type ChecklistItem = { key: string; label: string; done: boolean; detail: string; where: string };

function OnboardingStatus({ memberId }: { memberId: string }) {
  const onboarding = useHubRead<{ items: ChecklistItem[]; done: number; total: number }>(`members/${memberId}/onboarding`);
  if (onboarding.error) return <Notice tone="alert">{explainHubError(onboarding.error)}</Notice>;
  if (!onboarding.data) return <Notice>Checking onboarding…</Notice>;
  return (
    <>
      <p className={TEXT}>
        {onboarding.data.done} of {onboarding.data.total} steps complete
      </p>
      <ul aria-label="Checklist" className="space-y-2">
        {onboarding.data.items.map((item) => (
          <li key={item.key} className={ROW} aria-label={`${item.label}: ${item.done ? 'done' : 'needs attention'}`}>
            <strong className={TEXT}>
              {item.done ? '✓' : '○'} {item.label}
            </strong>
            <p className={cn(TEXT, 'muted')}>{item.detail}</p>
            {!item.done && <p className="text-[12px] muted">Where: {item.where}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

type Family = {
  household: string | null;
  members: { id: string; name: string }[];
  householdGuardians?: { id: string; name: string; primary: boolean }[];
  guardians: { id: string; name: string; channel: string; allowReply: boolean }[];
};

function FamilyRecords({ memberId }: { memberId: string }) {
  const workspace = useHubRead<{ member?: { id: string }; family: Family | null }>(`members/${memberId}`);
  if (workspace.error) return <Notice tone="alert">{explainHubError(workspace.error)}</Notice>;
  if (!workspace.data) return <Notice>Loading this member’s authorized records…</Notice>;
  if (workspace.data.member?.id !== memberId) return <Notice tone="alert">{explainHubError('MEMBER_DETAILS_UNAVAILABLE')}</Notice>;
  const family = workspace.data.family;
  if (!family) return <p className={TEXT}>Family and guardian details require manager or owner access.</p>;
  return (
    <>
      <p className={TEXT}>
        Household: <strong>{family.household || 'Not linked'}</strong>
      </p>
      {family.members.map((member) => (
        <p key={member.id} className={TEXT}>
          <Link href={`/dashboard/contacts/${member.id}`} className="underline underline-offset-4">
            {member.name} →
          </Link>
        </p>
      ))}
      <h3 className="font-semibold">Household guardians</h3>
      {family.householdGuardians?.length ? (
        family.householdGuardians.map((guardian) => (
          <div key={guardian.id} className={ROW}>
            <strong className={TEXT}>{guardian.name}</strong>
            <p className={cn(TEXT, 'muted')}>{guardian.primary ? 'Primary guardian' : 'Guardian'} · Native household relationship</p>
          </div>
        ))
      ) : (
        <p className={TEXT}>No guardian is recorded on this household.</p>
      )}
      <p className="text-[12px] muted">A household guardian is not a verified messaging channel and does not grant signing, payment or portal access.</p>
      <h3 className="font-semibold">Verified guardian channels</h3>
      {family.guardians.length ? (
        family.guardians.map((guardian) => (
          <div key={guardian.id} className={ROW}>
            <strong className={TEXT}>{guardian.name}</strong>
            <p className={cn(TEXT, 'muted')}>
              {guardian.channel} · {guardian.allowReply ? 'Replies permitted' : 'Replies not permitted'}
            </p>
          </div>
        ))
      ) : (
        <p className={TEXT}>No verified guardian channel is linked. A matching name or household does not establish consent.</p>
      )}
    </>
  );
}

type WaiverContext = {
  title: string;
  text: string;
  contentVersion: string;
  minor: boolean;
  state: string;
  signedBy: string | null;
  signedAt: string | null;
  pdfStored: boolean;
  signers: { partnerId: string; name: string; relationship: string }[];
  witnessedBy: string | null;
  version: number;
};

function WaiverForm({ data, disabled, review }: FormProps) {
  const waiver = useHubRead<WaiverContext>(`members/${data.member.id}/waiver`);
  const [signer, setSigner] = useState('');
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [inked, setInked] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return [((event.clientX - box.left) * event.currentTarget.width) / box.width, ((event.clientY - box.top) * event.currentTarget.height) / box.height];
  }
  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext('2d');
    if (!context || disabled) return;
    drawing.current = true;
    const [x, y] = point(event);
    context.lineWidth = 3;
    context.lineCap = 'round';
    // Ink on the white signature pad, like paper; the signed PDF shows it as drawn.
    context.strokeStyle = '#111';
    context.beginPath();
    context.moveTo(x, y);
  }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const [x, y] = point(event);
    context.lineTo(x, y);
    context.stroke();
    setInked(true);
  }
  function clear() {
    const pad = canvas.current;
    pad?.getContext('2d')?.clearRect(0, 0, pad.width, pad.height);
    setInked(false);
  }

  if (waiver.error) return <Notice tone="alert">{explainHubError(waiver.error)}</Notice>;
  if (!waiver.data) return <Notice>Loading waiver…</Notice>;
  const current = waiver.data;
  if (current.state === 'signed') {
    return (
      <p className={TEXT}>
        Signed by {current.signedBy}
        {current.signedAt ? ` · ${when(current.signedAt)}` : ''}
        {current.witnessedBy ? ` · witnessed by ${current.witnessedBy}` : ''}
        {current.pdfStored ? ' · signed PDF stored in Odoo' : ''}.
      </p>
    );
  }
  const chosen = current.signers.find((s) => s.partnerId === signer);
  return (
    <div className="space-y-3">
      <h4 className="font-semibold">{current.title}</h4>
      <div className={cn(TEXT, 'max-h-64 overflow-y-auto whitespace-pre-wrap rounded-control border border-[color:var(--color-border)] p-3')}>{current.text}</div>
      {!current.signers.length ? (
        <Notice tone="alert">
          {current.minor ? 'A household guardian must be linked in Odoo before a minor’s waiver can be signed.' : 'No eligible signer.'}
        </Notice>
      ) : (
        <>
          <Field label="Signer">
            <Select
              aria-label="Waiver signer"
              value={signer}
              disabled={disabled}
              onChange={(event) => {
                setSigner(event.target.value);
                setName(current.signers.find((s) => s.partnerId === event.target.value)?.name || '');
              }}
            >
              <option value="">Choose who is signing</option>
              {current.signers.map((s) => (
                <option key={s.partnerId} value={s.partnerId}>
                  {s.name} ({s.relationship === 'self' ? 'student' : 'guardian'})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Full name as signed">
            <Input aria-label="Name as signed" value={name} maxLength={120} disabled={disabled} onChange={(event) => setName(event.target.value)} />
          </Field>
          <canvas
            ref={canvas}
            aria-label="Signature pad"
            width={600}
            height={180}
            className="block aspect-[600/180] h-auto w-full max-w-[600px] touch-none rounded-control border border-[color:var(--color-border)] bg-white"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={() => {
              drawing.current = false;
            }}
            onPointerLeave={() => {
              drawing.current = false;
            }}
          />
          <Button size="sm" variant="ghost" disabled={disabled} onClick={clear}>
            Clear signature
          </Button>
          <label className={cn(TEXT, 'flex items-start gap-2')}>
            <input type="checkbox" aria-label="Signer read and agrees" checked={agreed} disabled={disabled} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5" />
            The signer read this waiver on this screen and agrees to it. I am witnessing the signature in person.
          </label>
          <Button
            size="sm"
            disabled={disabled || !chosen || !name.trim() || !agreed || !inked}
            onClick={() => {
              if (!chosen || !canvas.current) return;
              review({
                path: `members/${data.member.id}/waiver`,
                payload: {
                  signerPartnerId: chosen.partnerId,
                  signedByName: name.trim(),
                  contentVersion: current.contentVersion,
                  agreed: true,
                  signature: canvas.current.toDataURL('image/png'),
                },
                expectedVersion: current.version,
                description: `Save the waiver for ${data.member.name}, signed by ${name.trim()} (${chosen.relationship === 'self' ? 'student' : 'household guardian'}) and witnessed by you. Odoo stores the signature and a signed PDF on the student record.`,
              });
            }}
          >
            Review signature
          </Button>
        </>
      )}
    </div>
  );
}

type LedgerPayment = {
  id: string;
  amount: number;
  date: string;
  journal: string;
  evidence: string;
  provider: string | null;
  providerReference: string | null;
  transactionState: string | null;
};
type LedgerRefund = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  state: string;
  creditNote: string | null;
  requestedBy: string;
  approvedBy: string | null;
  refundPayment: string | null;
  version: number;
};
type LedgerInvoice = {
  id: string;
  number: string;
  date: string | null;
  total: number;
  remaining: number;
  currency: string;
  paymentState: string;
  settled: boolean;
  settlementEvidence: string[];
  payments: LedgerPayment[];
  refunds: LedgerRefund[];
  refundable: boolean;
};
type RefundPreview = { amount: number; currency: string; number: string; effects: string[]; reviewToken: string };

const REFUND_STATES: Record<string, string> = {
  awaiting_approval: 'Awaiting owner approval',
  awaiting_refund_payment: 'Credit note posted · return the money at the desk, then record it',
  awaiting_provider_refund: 'Credit note posted · waiting for the payment provider to confirm the refund',
  refunded_by_provider: 'Refunded · confirmed by the payment provider',
  refunded: 'Refunded · refund payment recorded by staff',
  cancelled: 'Cancelled',
};

function RefundsForm({ data, disabled, review }: FormProps) {
  const ledger = useHubRead<{ invoices: LedgerInvoice[]; canApprove: boolean }>(`members/${data.member.id}/billing`);
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const reasonFor = (key: string) => (reasons[key] || '').trim();
  const setReason = (key: string, value: string) => setReasons((previous) => ({ ...previous, [key]: value }));

  async function prepareRefund(invoice: LedgerInvoice) {
    const reason = reasonFor(invoice.id);
    setError('');
    try {
      const plan = await preview<RefundPreview>(`members/${data.member.id}/refunds/preview`, { invoiceId: invoice.id });
      review({
        path: `members/${data.member.id}/refunds`,
        payload: { invoiceId: invoice.id, reason, reviewToken: plan.reviewToken },
        description: `Request a full refund of ${money(plan.amount, plan.currency)} for ${plan.number}. ${plan.effects.join(' ')} Reason: ${reason}.`,
      });
    } catch (problem) {
      setError(explainHubError(problem instanceof Error ? problem.message : 'CONNECTION_UNAVAILABLE'));
    }
  }

  if (ledger.error) return <Notice tone="alert">{explainHubError(ledger.error)}</Notice>;
  if (!ledger.data) return <Notice>Loading settlement records…</Notice>;
  if (!ledger.data.invoices.length) return <p className={TEXT}>No posted invoices linked to this member.</p>;
  const canApprove = ledger.data.canApprove;
  return (
    <div className="space-y-3">
      <p className={TEXT}>
        Paid means Odoo has reconciled a payment. Online payments show the provider’s reference; desk payments show who recorded them. Refunds need an owner’s
        approval.
      </p>
      {error && <Notice tone="alert">{error}</Notice>}
      {ledger.data.invoices.map((invoice) => (
        <div key={invoice.id} className={ROW} role="group" aria-label={`Settlement for ${invoice.number}`}>
          <strong className={TEXT}>
            {invoice.number} · {money(invoice.total, invoice.currency)} · {invoice.paymentState.replaceAll('_', ' ')}
          </strong>
          {invoice.payments.map((payment) => (
            <p key={payment.id} className={cn(TEXT, 'muted')}>
              {payment.date} · {money(payment.amount, invoice.currency)} · {payment.journal} ·{' '}
              {payment.evidence === 'provider_receipt' ? `provider ${payment.provider} ref ${payment.providerReference}` : 'recorded by staff'}
            </p>
          ))}
          {!invoice.settled && (
            <p className={cn(TEXT, 'muted')}>Not settled. Nothing here marks an invoice paid; payment must come from the provider or a recorded payment in Odoo.</p>
          )}
          {invoice.refunds.map((refund) => {
            const key = `r${refund.id}`;
            const reason = reasonFor(key);
            const open = refund.state === 'awaiting_approval' || refund.state === 'awaiting_refund_payment';
            return (
              <div key={refund.id} className="space-y-2" role="group" aria-label={`Refund ${refund.id} for ${invoice.number}`}>
                <p className={TEXT}>
                  Refund {money(refund.amount, refund.currency)} · {REFUND_STATES[refund.state] || refund.state}
                  {refund.creditNote ? ` · credit note ${refund.creditNote}` : ''} · requested by {refund.requestedBy}
                  {refund.approvedBy ? ` · approved by ${refund.approvedBy}` : ''}
                </p>
                {open && (
                  <>
                    <Field label="Reason">
                      <Input
                        aria-label={`Reason for refund ${refund.id}`}
                        value={reasons[key] || ''}
                        maxLength={500}
                        disabled={disabled}
                        onChange={(event) => setReason(key, event.target.value)}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      {refund.state === 'awaiting_approval' && canApprove && (
                        <Button
                          size="sm"
                          disabled={disabled || !reason}
                          onClick={() =>
                            review({
                              path: `refunds/${refund.id}/approve`,
                              payload: { reason },
                              expectedVersion: refund.version,
                              description: `Approve the refund of ${money(refund.amount, refund.currency)} for ${invoice.number}. A full credit note is posted in Odoo now. Money is returned only when ${refund.method === 'provider' ? 'the payment provider confirms the refund' : 'staff record the refund payment'}.`,
                            })
                          }
                        >
                          Review refund approval
                        </Button>
                      )}
                      {refund.state === 'awaiting_approval' && (
                        <Button
                          size="sm"
                          disabled={disabled || !reason}
                          onClick={() =>
                            review({
                              path: `refunds/${refund.id}/cancel`,
                              payload: { reason },
                              expectedVersion: refund.version,
                              description: `Cancel the refund request for ${invoice.number}. No accounting entry is created.`,
                            })
                          }
                        >
                          Review refund cancellation
                        </Button>
                      )}
                      {refund.state === 'awaiting_refund_payment' && (
                        <Button
                          size="sm"
                          disabled={disabled || !reason}
                          onClick={() =>
                            review({
                              path: `refunds/${refund.id}/payment`,
                              payload: { reason },
                              expectedVersion: refund.version,
                              description: `Record that ${money(refund.amount, refund.currency)} was returned to the customer for ${invoice.number}, in the same journal as the original desk payment.`,
                            })
                          }
                        >
                          Review refund payment
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {invoice.refundable && (
            <div className="space-y-2">
              <Field label="Reason">
                <Input
                  aria-label={`Reason for refunding ${invoice.number}`}
                  value={reasons[invoice.id] || ''}
                  maxLength={500}
                  disabled={disabled}
                  onChange={(event) => setReason(invoice.id, event.target.value)}
                />
              </Field>
              <Button size="sm" disabled={disabled || !reasonFor(invoice.id)} onClick={() => void prepareRefund(invoice)}>
                Review refund request
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

type KioskAccess = {
  version: number;
  students: string[];
  guardians: { id: string; name: string; hasPhone: boolean; hasPin: boolean; setAt: string | null; setBy: string | null; locked: boolean }[];
};

function GuardianKioskForm({ data, disabled, review }: FormProps) {
  const access = useHubRead<KioskAccess>(`members/${data.member.id}/kiosk-access`);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});

  if (access.error) return <Notice tone="alert">{explainHubError(access.error)}</Notice>;
  if (!access.data) return <Notice>Loading kiosk access…</Notice>;
  if (!access.data.guardians.length) return <p className={TEXT}>No household guardian is linked to this student in Odoo.</p>;
  return (
    <div className="space-y-3">
      <p className={TEXT}>
        A parent can check in their own children at the kiosk with their phone number and a 6-digit PIN. Set the PIN with the parent at the desk; it is stored
        only as a secure hash and never sent.
      </p>
      {access.data.students.length > 0 && <p className={TEXT}>Children in this household: {access.data.students.join(', ')}</p>}
      {access.data.guardians.map((guardian) => {
        const pin = pins[guardian.id] || '';
        const reason = (reasons[guardian.id] || '').trim();
        return (
          <div key={guardian.id} className={ROW} role="group" aria-label={`Kiosk access for ${guardian.name}`}>
            <strong className={TEXT}>{guardian.name}</strong>
            <p className={cn(TEXT, 'muted')}>
              {guardian.hasPin
                ? `PIN set${guardian.setAt ? ` ${when(guardian.setAt)}` : ''}${guardian.setBy ? ` by ${guardian.setBy}` : ''}`
                : 'No kiosk PIN'}
              {guardian.locked ? ' · locked after failed attempts' : ''}
              {!guardian.hasPhone ? ' · no phone number in Odoo' : ''}
            </p>
            {guardian.hasPhone && (
              <div className="space-y-2">
                <Field label="New 6-digit PIN">
                  <Input
                    aria-label={`New kiosk PIN for ${guardian.name}`}
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    value={pin}
                    disabled={disabled}
                    onChange={(event) => setPins((previous) => ({ ...previous, [guardian.id]: event.target.value.replace(/[^0-9]/g, '') }))}
                  />
                </Field>
                <Field label="Reason">
                  <Input
                    aria-label={`Reason for kiosk PIN for ${guardian.name}`}
                    value={reasons[guardian.id] || ''}
                    maxLength={500}
                    disabled={disabled}
                    onChange={(event) => setReasons((previous) => ({ ...previous, [guardian.id]: event.target.value }))}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={disabled || pin.length !== 6 || !reason}
                    onClick={() =>
                      review({
                        path: `members/${data.member.id}/kiosk-access`,
                        payload: { guardianId: guardian.id, pin, reason },
                        description: `${guardian.hasPin ? 'Replace' : 'Set'} the kiosk check-in PIN for ${guardian.name}. Failed-attempt locks are cleared. The PIN is stored as a secure hash and is not shown again. Reason: ${reason}.`,
                      })
                    }
                  >
                    Review kiosk PIN
                  </Button>
                  {guardian.hasPin && (
                    <Button
                      size="sm"
                      disabled={disabled || !reason}
                      onClick={() =>
                        review({
                          path: `members/${data.member.id}/kiosk-access/revoke`,
                          payload: { guardianId: guardian.id, reason },
                          description: `Turn off kiosk check-in for ${guardian.name}. Any open kiosk family list is closed. Reason: ${reason}.`,
                        })
                      }
                    >
                      Review turning off kiosk PIN
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type ArchiveImpacts = {
  version: number;
  futureBookingCount: number;
  futureBookings: { enrollmentId: string; title: string; startsAt: string }[];
  openMemberships: number;
  portalAccounts: number;
  household: string | null;
  courses: { id: string; name: string }[];
  blockers: string[];
};

function ArchiveForm({ data, disabled, review }: FormProps) {
  const impacts = useHubRead<ArchiveImpacts>(`members/${data.member.id}/archive`);
  const [reason, setReason] = useState('');
  if (impacts.error) return <Notice tone="alert">{explainHubError(impacts.error)}</Notice>;
  if (!impacts.data) return <Notice>Checking what archiving would change…</Notice>;
  const current = impacts.data;
  return (
    <div className="space-y-3">
      <p className={TEXT}>{current.futureBookingCount} upcoming bookings would be cancelled. Attendance, rank and billing history stay in Odoo.</p>
      {current.courses.length > 0 && <p className={TEXT}>Course rosters kept for restore: {current.courses.map((course) => course.name).join(', ')}</p>}
      {current.household && <p className={TEXT}>Household: {current.household}</p>}
      {current.blockers.length ? (
        <div role="alert" className="space-y-1">
          {current.blockers.map((code) => (
            <p key={code} className={cn(TEXT, 'text-alert')}>
              {explainHubError(code)}
            </p>
          ))}
        </div>
      ) : (
        <>
          <Field label="Reason for archiving">
            <Textarea aria-label="Reason for archiving" value={reason} maxLength={500} disabled={disabled} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Button
            size="sm"
            variant="danger"
            disabled={disabled || !reason.trim()}
            onClick={() =>
              review({
                path: `members/${data.member.id}/archive`,
                payload: { reason: reason.trim() },
                expectedVersion: current.version,
                archive: true,
                description: `Archive ${data.member.name}. ${current.futureBookingCount} upcoming bookings will be cancelled and the student is hidden from rosters and the kiosk. Reason: ${reason.trim()}. You can restore the student later.`,
              })
            }
          >
            Review archiving
          </Button>
        </>
      )}
    </div>
  );
}

function RankForm({ data, disabled, review }: FormProps) {
  const [rankId, setRankId] = useState('');
  const rank = data.ranks.find((item) => item.id === rankId);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rank) return;
    const form = new FormData(event.currentTarget);
    const stripes = Number(form.get('stripes'));
    const reason = String(form.get('reason') || '').trim();
    if (!Number.isInteger(stripes) || stripes < 0 || stripes > rank.maxStripes || !reason) return;
    review({
      path: `members/${data.member.id}/rank`,
      payload: { rankId: rank.id, stripes, reason },
      expectedVersion: data.member.version,
      description: `Award ${rank.name}, ${stripes} stripes, to ${data.member.name}. Reason: ${reason}. This adds an Odoo rank-history record.`,
    });
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <Field label="Rank">
        <Select aria-label="Award rank" value={rankId} disabled={disabled} onChange={(event) => setRankId(event.target.value)}>
          <option value="">Choose rank</option>
          {data.ranks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Stripes">
        <Input name="stripes" type="number" min={0} max={rank?.maxStripes || 0} defaultValue={0} required disabled={disabled} />
      </Field>
      <Field label="Assessment reason">
        <Textarea name="reason" required maxLength={500} disabled={disabled} />
      </Field>
      <Button type="submit" size="sm" disabled={disabled || !rank}>
        Review rank award
      </Button>
    </form>
  );
}
