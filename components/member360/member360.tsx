import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { PANEL, Pill, formatIn, withParams } from '@/components/odoo/shared';
import { MemberActions } from '@/components/member360/actions';
import { attendanceLabel, attended, memberInsight, type Member360 } from '@/lib/member360';
import { cn, formatCurrency, initials } from '@/lib/utils';

export const MEMBER_TABS = ['overview', 'timeline', 'attendance', 'progress', 'membership', 'billing', 'family', 'messages', 'documents'] as const;
export type MemberTab = (typeof MEMBER_TABS)[number];

type T = Awaited<ReturnType<typeof getTranslations<'member360'>>>;

/**
 * Member 360 (§15), after the inspiration/member360.png design: header,
 * actions, tabs, and a member-intelligence column. All data from Odoo.
 */
export async function Member360View({ member, tab, timezone, currency }: { member: Member360; tab: MemberTab; timezone: string; currency: string }) {
  const t = await getTranslations('member360');
  const ts = await getTranslations('academy');
  const insight = memberInsight(member);
  const base = `/dashboard/contacts/${member.id}`;
  const date = (iso: string | null) => (iso ? formatIn(iso.length === 10 ? `${iso}T12:00:00Z` : iso, timezone, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
  const dateTime = (iso: string) => formatIn(iso, timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const money = (amount: number, cur: string | null) => {
    try {
      return formatCurrency(amount, cur ?? currency);
    } catch {
      return amount.toFixed(2);
    }
  };
  const activeProgram = member.programs.find((p) => p.active)?.program ?? null;
  const subtitle = [activeProgram, member.minor && member.guardian ? t('familyOf', { name: member.guardian }) : null, member.memberNumber]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="-mx-4 -mt-6 sm:-mx-6">
      {/* Header */}
      <div className="border-b border-[color:var(--color-border)] px-4 pb-5 pt-5 sm:px-6">
        <Link href="/dashboard/contacts" className="mb-4 inline-flex items-center gap-1.5 text-[12px] muted">
          <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" strokeWidth={1.75} />
          {t('backToMembers')}
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-canvas)] font-mono text-[12px] font-semibold">
            {initials(member.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold">{member.name}</h1>
            {subtitle && <p className="truncate text-[13px] muted">{subtitle}</p>}
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase',
              member.membershipState === 'active' ? 'border-warning/70 text-warning' : 'border-[color:var(--color-border)] muted',
            )}
          >
            {ts(`state.${member.membershipState}`)} · {member.rank ?? t('unranked')}
          </span>
        </div>
        <div className="mt-4">
          <MemberActions name={member.name} prompt={t('doForMePrompt', { name: member.name, number: member.memberNumber ?? String(member.id) })} />
        </div>
      </div>

      {/* Tabs */}
      <nav aria-label={t('tabsLabel')} className="flex gap-1 overflow-x-auto border-b border-[color:var(--color-border)] px-4 scrollbar-thin sm:px-6">
        {MEMBER_TABS.map((key) => (
          <Link
            key={key}
            href={key === 'overview' ? base : withParams(base, { tab: key })}
            aria-current={key === tab ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap border-b-2 px-2.5 py-3 text-[12px]',
              key === tab ? 'border-[#e5172f] font-semibold' : 'border-transparent muted',
            )}
          >
            {t(`tabs.${key}`)}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {tab === 'overview' && <Overview member={member} t={t} date={date} />}

          {tab === 'timeline' && (
            <section className={PANEL} aria-label={t('tabs.timeline')}>
              <Timeline member={member} t={t} date={date} />
            </section>
          )}

          {tab === 'attendance' && (
            <section className={PANEL} aria-label={t('tabs.attendance')}>
              <Rows
                empty={t('empty.attendance')}
                rows={member.attendance.map((a) => ({
                  key: a.id,
                  left: dateTime(a.at),
                  middle: a.session ?? '—',
                  right: <AttendancePill status={a.status} late={a.late} t={t} />,
                }))}
              />
            </section>
          )}

          {tab === 'progress' && (
            <div className="space-y-4">
              <section className={PANEL} aria-labelledby="progress-now">
                <p id="progress-now" className="eyebrow mb-3">
                  {t('progression')}
                </p>
                <Def label={t('currentRank')} value={member.rank ? `${member.rank}${member.stripes ? ` · ${ts('stripes', { count: member.stripes })}` : ''}` : t('unranked')} />
                <Def
                  label={t('towardNextRank')}
                  value={member.rankThreshold ? `${member.sinceLastRank} / ${member.rankThreshold}` : String(member.sinceLastRank)}
                />
              </section>
              <section className={PANEL} aria-labelledby="progress-ranks">
                <p id="progress-ranks" className="eyebrow mb-1">
                  {t('rankHistory')}
                </p>
                <Rows
                  empty={t('empty.ranks')}
                  rows={member.ranks.map((r) => ({
                    key: r.id,
                    left: date(r.awardedOn),
                    middle: [r.rank, r.program].filter(Boolean).join(' · ') || '—',
                    right: r.awardedBy ? <span className="muted">{r.awardedBy}</span> : null,
                  }))}
                />
              </section>
              <section className={PANEL} aria-labelledby="progress-tests">
                <p id="progress-tests" className="eyebrow mb-1">
                  {t('beltTests')}
                </p>
                <Rows
                  empty={t('empty.tests')}
                  rows={member.tests.map((x) => ({
                    key: x.id,
                    left: x.test ?? '—',
                    middle: x.target ? t('testingFor', { rank: x.target }) : '—',
                    right: x.result ? <Pill tone={x.result === 'pass' ? 'success' : x.result === 'fail' ? 'alert' : 'neutral'}>{t(`testResult.${x.result}`)}</Pill> : null,
                  }))}
                />
              </section>
            </div>
          )}

          {tab === 'membership' && (
            <div className="space-y-4">
              <section className={PANEL} aria-labelledby="membership-plans">
                <p id="membership-plans" className="eyebrow mb-1">
                  {t('plans')}
                </p>
                <Rows
                  empty={t('empty.plans')}
                  rows={member.subscriptions.map((s) => ({
                    key: s.id,
                    left: s.plan ?? s.name,
                    middle: [t('since', { date: date(s.startedOn) }), s.nextBilling ? t('nextBilling', { date: date(s.nextBilling) }) : null, money(s.amount, s.currency)]
                      .filter(Boolean)
                      .join(' · '),
                    right: <Pill tone={s.paused ? 'warning' : s.state === 'active' ? 'success' : 'neutral'}>{s.paused ? t('paused') : (s.state ?? '—')}</Pill>,
                  }))}
                />
              </section>
              <section className={PANEL} aria-labelledby="membership-programs">
                <p id="membership-programs" className="eyebrow mb-1">
                  {t('programs')}
                </p>
                <Rows
                  empty={t('empty.programs')}
                  rows={member.programs.map((p) => ({
                    key: p.id,
                    left: p.program ?? '—',
                    middle: p.enrolledOn ? t('since', { date: date(p.enrolledOn) }) : '',
                    right: <Pill tone={p.active ? 'success' : 'neutral'}>{p.active ? t('activeProgram') : t('ended')}</Pill>,
                  }))}
                />
              </section>
            </div>
          )}

          {tab === 'billing' && (
            <section className={PANEL} aria-label={t('tabs.billing')}>
              <Rows
                empty={t('empty.invoices')}
                rows={member.invoices.map((i) => ({
                  key: i.id,
                  left: <span className="font-mono">{i.number}</span>,
                  middle: `${date(i.date)} · ${money(i.total, i.currency)}${i.outstanding > 0 && i.state === 'posted' ? ` · ${t('outstanding', { amount: money(i.outstanding, i.currency) })}` : ''}`,
                  right:
                    i.state === 'draft' ? (
                      <Pill>{t('invoice.draft')}</Pill>
                    ) : i.paymentState === 'paid' || i.paymentState === 'in_payment' ? (
                      <Pill tone="success">{t('invoice.paid')}</Pill>
                    ) : (
                      <Pill tone="warning">{t('invoice.unpaid')}</Pill>
                    ),
                }))}
              />
            </section>
          )}

          {tab === 'family' && (
            <div className="space-y-4">
              <section className={PANEL} aria-labelledby="family-guardian">
                <p id="family-guardian" className="eyebrow mb-3">
                  {t('guardianSection')}
                </p>
                <Def label={t('guardian')} value={member.guardian ?? (member.minor ? t('noGuardian') : t('notMinor'))} />
                <Def label={t('phone')} value={member.phone ?? '—'} ltr />
                <Def label={t('email')} value={member.email ?? '—'} />
              </section>
              <section className={PANEL} aria-labelledby="family-emergency">
                <p id="family-emergency" className="eyebrow mb-1">
                  {t('emergencyContacts')}
                </p>
                <Rows
                  empty={t('empty.emergency')}
                  rows={member.emergencyContacts.map((c) => ({
                    key: c.id,
                    left: c.name,
                    middle: (
                      <>
                        {c.relationship} · <span dir="ltr">{c.phone}</span>
                      </>
                    ),
                    right: c.primary ? <Pill>{t('primary')}</Pill> : null,
                  }))}
                />
              </section>
            </div>
          )}

          {tab === 'messages' && (
            <section className={PANEL}>
              <p className="text-[13px] font-semibold">{t('messagesTitle')}</p>
              <p className="mt-1 text-[12px] muted">{t('messagesPending')}</p>
            </section>
          )}

          {tab === 'documents' && (
            <section className={PANEL} aria-labelledby="docs-waiver">
              <p id="docs-waiver" className="eyebrow mb-3">
                {t('waiver')}
              </p>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span>{t('liabilityWaiver')}</span>
                {member.waiverState === 'signed' ? (
                  <Pill tone="success">{member.waiverSignedOn ? t('signedOn', { date: date(member.waiverSignedOn) }) : t('signed')}</Pill>
                ) : (
                  <Pill tone="warning">{t('notSigned')}</Pill>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Member intelligence */}
        <aside className="h-fit space-y-3" aria-labelledby="member-intel">
          <section className={PANEL}>
            <p id="member-intel" className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#8b7cf6]">
              {t('intel.title')}
            </p>
            <Def label={t('intel.engagement')} value={t(`intel.engagementLevel.${insight.engagement}`)} />
            <Def
              label={t('intel.retentionRisk')}
              value={`${t(`intel.riskLevel.${insight.retentionRisk}`)}${insight.daysSinceClass !== null ? ` · ${t('intel.daysSince', { count: insight.daysSinceClass })}` : ''}`}
            />
            <Def label={t('intel.testingReadiness')} value={insight.testingReadiness === null ? '—' : `${insight.testingReadiness}%`} />
            <p className="mt-3 text-[10px] muted">{t('intel.ruleBased')}</p>
          </section>
          {insight.suggestion && (
            <section className="rounded-card bg-inset p-4">
              <p className="text-[12px] font-semibold">{t('intel.suggested')}</p>
              <p className="mt-1 text-[13px] font-bold">{t(`intel.suggestion.${insight.suggestion}.title`)}</p>
              <p className="mt-1 text-[11px] muted">{t(`intel.suggestion.${insight.suggestion}.why`, { days: insight.daysSinceClass ?? 0 })}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Overview({ member, t, date }: { member: Member360; t: T; date: (iso: string | null) => string }) {
  const insight = memberInsight(member);
  const story =
    member.membershipState !== 'active'
      ? 'notActive'
      : insight.retentionRisk === 'high'
        ? 'atRisk'
        : insight.testingReadiness === 100
          ? 'readyToTest'
          : insight.engagement === 'low'
            ? 'slipping'
            : insight.engagement === 'unknown'
              ? 'new'
              : 'progressing';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={PANEL} aria-labelledby="member-story">
        <p id="member-story" className="eyebrow mb-2">
          {t('memberStory')}
        </p>
        <p className="mb-4 text-xl font-bold">{t(`story.${story}`)}</p>
        <Def label={t('attendance')} value={`${Math.round(member.attendanceRate)}%`} />
        <Def label={t('classes')} value={String(member.totalSessions)} />
        <Def label={t('currentRank')} value={member.rank ?? t('unranked')} />
        <Def label={t('joined')} value={date(member.joinedOn)} />
        <p className="eyebrow mb-1 mt-5">{t('recent')}</p>
        <Timeline member={member} t={t} date={date} limit={3} />
      </section>

      <section className={PANEL} aria-labelledby="member-training">
        <p id="member-training" className="eyebrow mb-2">
          {t('training')}
        </p>
        <Def label={t('program')} value={member.programs.find((p) => p.active)?.program ?? '—'} />
        <Def label={t('primaryInstructor')} value={member.primaryInstructor ?? '—'} />
        <Def label={t('plan')} value={member.subscriptions.find((s) => s.state === 'active')?.plan ?? '—'} />
        <p className="eyebrow mb-2 mt-5">{t('progression')}</p>
        <Def label={t('currentRank')} value={member.rank ?? t('unranked')} />
        <Def
          label={t('towardNextRank')}
          value={member.rankThreshold ? `${member.sinceLastRank} / ${member.rankThreshold}` : String(member.sinceLastRank)}
        />
      </section>
    </div>
  );
}

/** Attendance, rank awards and invoices merged into one dated story. */
function Timeline({ member, t, date, limit }: { member: Member360; t: T; date: (iso: string | null) => string; limit?: number }) {
  const events = [
    ...member.attendance.map((a) => ({
      key: `a${a.id}`,
      at: a.at,
      text: attended(a.status) ? t('event.checkedIn', { session: a.session ?? '' }) : t(`event.${attendanceLabel(a.status)}`, { session: a.session ?? '' }),
    })),
    ...member.ranks.map((r) => ({ key: `r${r.id}`, at: `${r.awardedOn}T12:00:00Z`, text: t('event.promoted', { rank: r.rank ?? '' }) })),
    ...member.invoices
      .filter((i) => i.date)
      .map((i) => ({
        key: `i${i.id}`,
        at: `${i.date}T12:00:00Z`,
        text: i.paymentState === 'paid' || i.paymentState === 'in_payment' ? t('event.paid', { number: i.number }) : t('event.invoiced', { number: i.number }),
      })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit ?? 50);

  return (
    <Rows
      empty={t('empty.timeline')}
      rows={events.map((e) => ({ key: e.key, left: <span className="font-semibold">{date(e.at)}</span>, middle: e.text, right: null }))}
    />
  );
}

function AttendancePill({ status, late, t }: { status: string; late: boolean; t: T }) {
  const label = attendanceLabel(status);
  if (label === 'present') return <Pill tone="success">{late ? t('att.late') : t('att.present')}</Pill>;
  if (label === 'late') return <Pill tone="warning">{t('att.late')}</Pill>;
  if (label === 'absent') return <Pill tone="alert">{t('att.absent')}</Pill>;
  return <Pill>{t('att.excused')}</Pill>;
}

function Def({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[color:var(--color-border)] py-2.5 text-[12px]">
      <span className="muted">{label}</span>
      <span className="truncate text-end font-semibold" dir={ltr ? 'ltr' : undefined}>
        {value}
      </span>
    </div>
  );
}

function Rows({ rows, empty }: { rows: { key: string | number; left: React.ReactNode; middle: React.ReactNode; right: React.ReactNode }[]; empty: string }) {
  if (!rows.length) return <p className="py-3 text-[12px] muted">{empty}</p>;
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3 border-b border-[color:var(--color-border)] py-2.5 text-[12px] last:border-0">
          <span className="w-32 shrink-0 truncate">{r.left}</span>
          <span className="min-w-0 flex-1 truncate muted">{r.middle}</span>
          {r.right}
        </li>
      ))}
    </ul>
  );
}
