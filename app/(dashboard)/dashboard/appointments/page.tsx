import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CalendarDays } from 'lucide-react';
import { requireWorkspace } from '@/lib/session';
import { can } from '@/lib/rbac';
import { isCalendarConfigured } from '@/lib/integrations/calendar';
import { AppointmentsClient } from '@/components/appointments/appointments-client';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { odooConfigured } from '@/lib/odoo';
import { loadLessonPlan, loadSessionRoster, loadSessions, type LessonPlan, type RosterEntry, type SessionSummary } from '@/lib/academy';
import { PANEL, Pill, RosterList, Stat, dayBounds, formatIn, withParams } from '@/components/odoo/shared';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Classes' };

const PATH = '/dashboard/appointments';

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string; reason?: string; week?: string; session?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const params = await searchParams;

  // Without Odoo, fall back to Roster's own appointment book.
  if (!odooConfigured()) {
    return (
      <AppointmentsClient
        calendarNotice={params.calendar}
        calendarReason={params.reason}
        googleConfigured={isCalendarConfigured('google')}
        outlookConfigured={isCalendarConfigured('outlook')}
        canManageCalendars={can(user.role, 'integrations:manage')}
      />
    );
  }

  const t = await getTranslations('odoo');
  const tz = workspace.timezone;
  const week = Math.max(-52, Math.min(52, Number(params.week) || 0));
  const from = dayBounds(tz, week * 7).start;
  const to = dayBounds(tz, week * 7 + 6).end;
  const selectedId = Number(params.session) || null;

  let sessions: SessionSummary[] = [];
  let roster: RosterEntry[] = [];
  let plan: LessonPlan | null = null;
  let failed = false;
  try {
    [sessions, roster, plan] = await Promise.all([
      loadSessions(from, to),
      selectedId ? loadSessionRoster(selectedId) : [],
      selectedId ? loadLessonPlan(selectedId) : null,
    ]);
  } catch (error) {
    console.error('[classes] Odoo read failed:', error);
    failed = true;
  }

  const days = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const key = formatIn(s.startsAt, tz, { weekday: 'long', month: 'short', day: 'numeric' });
    days.set(key, [...(days.get(key) ?? []), s]);
  }
  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const time = (iso: string) => formatIn(iso, tz, { hour: 'numeric', minute: '2-digit' });
  const range = `${formatIn(from.toISOString(), tz, { month: 'short', day: 'numeric' })} – ${formatIn(
    new Date(to.getTime() - 1).toISOString(),
    tz,
    { month: 'short', day: 'numeric' },
  )}`;

  return (
    <>
      <PageHeader
        title={t('classes.title')}
        description={t('classes.description')}
        actions={
          <nav aria-label={t('classes.weekNav')} className="flex items-center gap-1.5 text-xs">
            <Link href={withParams(PATH, { week: week - 1 })} className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5">
              {t('classes.prevWeek')}
            </Link>
            <Link href={PATH} className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5">
              {t('classes.thisWeek')}
            </Link>
            <Link href={withParams(PATH, { week: week + 1 })} className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5">
              {t('classes.nextWeek')}
            </Link>
          </nav>
        }
      />

      {failed ? (
        <Card>
          <EmptyState icon={<CalendarDays strokeWidth={1.75} />} title={t('unavailableTitle')} description={t('unavailable')} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardHeader title={range} description={t('classes.count', { count: sessions.length })} />
            {sessions.length ? (
              <div>
                {[...days.entries()].map(([day, list]) => (
                  <section key={day} aria-label={day}>
                    <h3 className="border-b border-[color:var(--color-border)] bg-inset px-4 py-2 text-[11px] font-semibold uppercase tracking-wide muted">
                      {day}
                    </h3>
                    <ul>
                      {list.map((s) => (
                        <li key={s.id}>
                          <Link
                            href={withParams(PATH, { week, session: s.id })}
                            aria-current={s.id === selectedId ? 'true' : undefined}
                            className={cn(
                              'flex items-center gap-3 border-b border-[color:var(--color-border)] px-4 py-3 text-[13px]',
                              s.id === selectedId && 'bg-inset font-semibold',
                              (s.done || s.state === 'cancelled') && 'muted',
                            )}
                          >
                            <span className="w-24 shrink-0 font-mono text-[11px]">
                              {time(s.startsAt)}–{time(s.endsAt)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{s.template}</span>
                              {s.instructor && <span className="block truncate text-[11px] muted">{s.instructor}</span>}
                            </span>
                            {s.state === 'cancelled' ? (
                              <Pill tone="alert">{t('sessionState.cancelled')}</Pill>
                            ) : (
                              <span
                                className={cn('shrink-0 font-mono text-[11px]', s.capacity && s.booked >= s.capacity && 'text-alert')}
                                title={t('classes.bookedOfCapacity')}
                              >
                                {s.done ? `${s.present}/${s.booked}` : `${s.booked}/${s.capacity}`}
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <EmptyState icon={<CalendarDays strokeWidth={1.75} />} title={t('classes.none')} description={t('classes.noneHint')} />
            )}
          </Card>

          <aside className={cn(PANEL, 'h-fit')} aria-labelledby="class-detail">
            <p id="class-detail" className="eyebrow mb-3">
              {t('classes.detail')}
            </p>
            {selected ? (
              <>
                <p className="text-[15px] font-bold">{selected.template}</p>
                <p className="mt-0.5 text-[12px] muted">
                  {formatIn(selected.startsAt, tz, { weekday: 'short', month: 'short', day: 'numeric' })} · {time(selected.startsAt)}–
                  {time(selected.endsAt)}
                  {selected.instructor ? ` · ${selected.instructor}` : ''}
                </p>

                <dl className="mt-4 grid grid-cols-3 gap-2">
                  <Stat label={t('classes.booked')} value={`${selected.booked}/${selected.capacity}`} />
                  <Stat label={t('classes.present')} value={String(selected.present)} />
                  <Stat label={t('classes.state')} value={t(`sessionState.${selected.state}`)} />
                </dl>

                {plan && (
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold">{t('classes.lessonPlan')}</p>
                    <p className="mt-1 text-[12px] muted">
                      {t(`level.${plan.level ?? 'all'}`)} · {t('classes.minutes', { count: plan.durationMinutes })}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-[12px]">{plan.description ?? t('classes.noPlan')}</p>
                  </div>
                )}

                <p className="mb-1 mt-4 text-[11px] font-semibold">{t('classes.roster')}</p>
                <RosterList roster={roster} empty={t('classes.noRoster')} labels={{
                  present: t('attendance.present'),
                  absent: t('attendance.absent'),
                  excused: t('attendance.excused'),
                  pending: t('attendance.pending'),
                  waitlist: t('classes.waitlist'),
                }} />
                <p className="mt-3 text-[11px] muted">{t('classes.checkInNote')}</p>
              </>
            ) : (
              <p className="py-3 text-[12px] muted">{t('classes.pick')}</p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
