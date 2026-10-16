'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, Circle } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import type { AcademyClass, Arrival, MemberCard } from '@/lib/academy';

const CARD = 'rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-4 sm:p-5';

export type AcademyData =
  | { ok: true; classes: AcademyClass[]; selectedId: number | null; arrivals: Arrival[]; member: MemberCard | null }
  | { ok: false };

/**
 * Today's classes, the selected class's arrivals and the picked member's
 * context, all read from Odoo — the academy's system of record.
 */
export function AcademyToday({ data, timezone }: { data: AcademyData; timezone: string }) {
  const t = useTranslations('academy');

  if (!data.ok) {
    return (
      <div className="mx-auto mb-3 max-w-5xl">
        <p className={cn(CARD, 'text-[12px] text-alert')}>{t('unavailable')}</p>
      </div>
    );
  }

  const time = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleTimeString();
    }
  };
  const selected = data.classes.find((c) => c.id === data.selectedId) ?? null;
  const here = data.arrivals.filter((a) => a.checkedIn).length;

  return (
    <div className="mx-auto mb-3 grid max-w-5xl gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <section className={CARD} aria-labelledby="academy-today">
        <p id="academy-today" className="eyebrow mb-2">
          {t('today')}
        </p>
        {data.classes.length ? (
          <ul>
            {data.classes.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard?class=${c.id}`}
                  aria-current={c.id === data.selectedId ? 'true' : undefined}
                  className={cn(
                    'flex items-center justify-between gap-3 border-b border-[color:var(--color-border)] py-3 text-[12px]',
                    c.id === data.selectedId && 'font-semibold',
                    c.done && 'muted',
                  )}
                >
                  <span className="w-16 shrink-0 font-mono text-[11px]">{time(c.startsAt)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className={cn('shrink-0 font-mono text-[11px]', c.capacity && c.booked >= c.capacity && 'text-alert')}>
                    {c.booked}/{c.capacity}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-[12px] muted">{t('noClasses')}</p>
        )}
      </section>

      <section className={CARD} aria-labelledby="academy-arrivals">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p id="academy-arrivals" className="eyebrow">
            {t('arrivals')}
          </p>
          {selected && (
            <p className="font-mono text-[11px] muted">{t('hereCount', { here, booked: data.arrivals.length })}</p>
          )}
        </div>
        {selected ? (
          <>
            <p className="mb-2 truncate text-[12px] muted">
              {time(selected.startsAt)} · {selected.name}
              {selected.instructor ? ` · ${selected.instructor}` : ''}
            </p>
            {data.arrivals.length ? (
              <ul>
                {data.arrivals.map((a) => (
                  <li key={a.memberId}>
                    <Link
                      href={`/dashboard?class=${selected.id}&dojoMember=${a.memberId}`}
                      className={cn(
                        'flex items-center gap-2.5 border-b border-[color:var(--color-border)] py-2.5 text-[12px]',
                        data.member?.id === a.memberId && 'font-semibold',
                      )}
                    >
                      {a.checkedIn ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.25} aria-label={t('checkedIn')} />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0 muted" strokeWidth={2} aria-label={t('notHere')} />
                      )}
                      <span className="truncate">{a.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-[12px] muted">{t('noArrivals')}</p>
            )}
          </>
        ) : (
          <p className="py-3 text-[12px] muted">{t('pickClass')}</p>
        )}
      </section>

      <section className={CARD} aria-labelledby="academy-member">
        <p id="academy-member" className="eyebrow mb-3">
          {t('member')}
        </p>
        {data.member ? <Member member={data.member} /> : <p className="py-3 text-[12px] muted">{t('pickMember')}</p>}
      </section>
    </div>
  );
}

export function Member({ member }: { member: MemberCard }) {
  const t = useTranslations('academy');
  const progress = member.rankThreshold ? Math.min(100, Math.round((member.sinceLastRank / member.rankThreshold) * 100)) : null;

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-canvas)] font-mono text-[11px] font-semibold">
          {initials(member.name)}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/dashboard/contacts/${member.id}`} className="block truncate text-[15px] font-bold hover:underline">
            {member.name}
          </Link>
          <p className="truncate text-[12px] muted">
            {member.rank ? `${member.rank}${member.stripes ? ` · ${t('stripes', { count: member.stripes })}` : ''}` : t('noRank')}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase',
            member.membershipState === 'active' ? 'border-success/60 text-success' : 'border-[color:var(--color-border)] muted',
          )}
        >
          {t(`state.${member.membershipState}`)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Stat label={t('attendanceRate')} value={`${Math.round(member.attendanceRate)}%`} />
        <Stat
          label={t('lastAttendance')}
          value={member.lastAttendance ? new Date(member.lastAttendance.at).toLocaleDateString() : '—'}
        />
      </dl>

      {progress !== null && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="muted">{t('promotionAttendance')}</span>
            <span className="font-mono">
              {member.sinceLastRank} / {member.rankThreshold}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-inset" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-success" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {member.minor && (
        <p className="mt-4 text-[12px] muted">{member.guardian ? t('guardian', { name: member.guardian }) : t('minorNoGuardian')}</p>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-inset px-3 py-2.5">
      <dt className="truncate text-[10px] muted">{label}</dt>
      <dd className="mt-1 truncate text-[11px] font-semibold">{value}</dd>
    </div>
  );
}
