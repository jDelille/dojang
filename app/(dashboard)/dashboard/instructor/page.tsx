import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { GraduationCap } from 'lucide-react';
import { requireWorkspace } from '@/lib/session';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { odooConfigured } from '@/lib/odoo';
import { loadLessonPlan, loadSessionRoster, loadTodayClasses, type AcademyClass, type LessonPlan, type RosterEntry } from '@/lib/academy';
import { PANEL, RosterList, Stat, dayBounds, formatIn, withParams } from '@/components/odoo/shared';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Instructor Focus' };

const PATH = '/dashboard/instructor';

/**
 * Instructor Focus (§12): tonight's class, booked vs present, who isn't here
 * yet and the lesson plan. No invoices, no marketing. Check-in stays with
 * Odoo's kiosk until a staff check-in route exists.
 */
export default async function InstructorPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const { workspace } = await requireWorkspace();
  const t = await getTranslations('odoo');
  const params = await searchParams;
  const tz = workspace.timezone;

  if (!odooConfigured()) {
    return (
      <>
        <PageHeader title={t('instructor.title')} />
        <Card>
          <EmptyState icon={<GraduationCap strokeWidth={1.75} />} title={t('notConnectedTitle')} description={t('notConnected')} />
        </Card>
      </>
    );
  }

  const { start, end } = dayBounds(tz);
  let classes: AcademyClass[] = [];
  let roster: RosterEntry[] = [];
  let plan: LessonPlan | null = null;
  let current: AcademyClass | null = null;
  let failed = false;
  try {
    classes = await loadTodayClasses(start, end);
    const now = Date.now();
    current =
      classes.find((c) => c.id === Number(params.session)) ??
      classes.find((c) => new Date(c.endsAt).getTime() > now && !c.done) ??
      classes[classes.length - 1] ??
      null;
    if (current) [roster, plan] = await Promise.all([loadSessionRoster(current.id), loadLessonPlan(current.id)]);
  } catch (error) {
    console.error('[instructor] Odoo read failed:', error);
    failed = true;
  }

  const time = (iso: string) => formatIn(iso, tz, { hour: 'numeric', minute: '2-digit' });
  const booked = roster.filter((r) => !r.waitlist);
  const notHere = booked.filter((r) => r.attendance !== 'present');
  const here = booked.filter((r) => r.attendance === 'present');
  const labels = {
    present: t('attendance.present'),
    absent: t('attendance.absent'),
    excused: t('attendance.excused'),
    pending: t('attendance.pending'),
    waitlist: t('classes.waitlist'),
  };

  return (
    <>
      <PageHeader title={t('instructor.title')} description={t('instructor.description')} />

      {failed ? (
        <Card>
          <EmptyState icon={<GraduationCap strokeWidth={1.75} />} title={t('unavailableTitle')} description={t('unavailable')} />
        </Card>
      ) : !current ? (
        <Card>
          <EmptyState icon={<GraduationCap strokeWidth={1.75} />} title={t('instructor.noClass')} description={t('instructor.noClassHint')} />
        </Card>
      ) : (
        <div className="mx-auto max-w-4xl space-y-4">
          {classes.length > 1 && (
            <nav aria-label={t('instructor.todaysClasses')} className="flex flex-wrap gap-1.5">
              {classes.map((c) => (
                <Link
                  key={c.id}
                  href={withParams(PATH, { session: c.id })}
                  aria-current={c.id === current!.id ? 'page' : undefined}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[12px]',
                    c.id === current!.id ? 'border-[color:var(--color-fg)] font-semibold' : 'border-[color:var(--color-border)] muted',
                  )}
                >
                  {time(c.startsAt)} · {c.name}
                </Link>
              ))}
            </nav>
          )}

          <section className={PANEL} aria-labelledby="focus-class">
            <p className="eyebrow">{t('instructor.thisClass')}</p>
            <h2 id="focus-class" className="mt-1 text-2xl font-bold">
              {plan?.template ?? current.name}
            </h2>
            <p className="mt-1 text-[13px] muted">
              {time(current.startsAt)}–{time(current.endsAt)}
              {current.instructor ? ` · ${current.instructor}` : ''}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <Stat label={t('classes.booked')} value={`${current.booked}/${current.capacity}`} />
              <Stat label={t('classes.present')} value={String(here.length)} />
              <Stat label={t('instructor.notHere')} value={String(notHere.length)} />
            </dl>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className={PANEL} aria-labelledby="focus-not-here">
              <p id="focus-not-here" className="eyebrow mb-2">
                {t('instructor.notHere')}
              </p>
              <RosterList roster={notHere} empty={t('instructor.everyoneHere')} labels={labels} />
              <p className="mt-3 text-[11px] muted">{t('classes.checkInNote')}</p>
            </section>

            <section className={PANEL} aria-labelledby="focus-plan">
              <p id="focus-plan" className="eyebrow mb-2">
                {t('classes.lessonPlan')}
              </p>
              {plan ? (
                <>
                  <p className="text-[12px] muted">
                    {t(`level.${plan.level ?? 'all'}`)} · {t('classes.minutes', { count: plan.durationMinutes })}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-[13px]">{plan.description ?? t('classes.noPlan')}</p>
                </>
              ) : (
                <p className="text-[12px] muted">{t('classes.noPlan')}</p>
              )}
            </section>
          </div>

          {here.length > 0 && (
            <section className={PANEL} aria-labelledby="focus-here">
              <p id="focus-here" className="eyebrow mb-2">
                {t('instructor.here')}
              </p>
              <RosterList roster={here} empty="" labels={labels} />
            </section>
          )}
        </div>
      )}
    </>
  );
}
