import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Activity } from 'lucide-react';
import { requireWorkspace } from '@/lib/session';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { StatTile } from '@/components/charts';
import { odooConfigured } from '@/lib/odoo';
import { MEMBERSHIP_STATES, loadPulse, type Pulse } from '@/lib/academy';
import { countOpenLeads } from '@/lib/odoo-crm';
import { countOverdueInvoices } from '@/lib/odoo-invoices';
import { PANEL, dayBounds, withParams } from '@/components/odoo/shared';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Business Pulse' };

/** Business Pulse (§30), read from Odoo: members, attendance, today's fill, pipeline and money owed. */
export default async function PulsePage() {
  const { workspace } = await requireWorkspace();
  const t = await getTranslations('odoo');

  if (!odooConfigured()) {
    return (
      <>
        <PageHeader title={t('pulse.title')} />
        <Card>
          <EmptyState icon={<Activity strokeWidth={1.75} />} title={t('notConnectedTitle')} description={t('notConnected')} />
        </Card>
      </>
    );
  }

  const { start, end } = dayBounds(workspace.timezone);
  let pulse: Pulse | null = null;
  let openLeads = 0;
  let overdue: number | null = null;
  try {
    [pulse, openLeads, overdue] = await Promise.all([
      loadPulse(start, end),
      countOpenLeads(),
      // Accounting may be restricted for the API user; the pulse still shows without it.
      countOverdueInvoices().catch(() => null),
    ]);
  } catch (error) {
    console.error('[pulse] Odoo read failed:', error);
  }

  if (!pulse) {
    return (
      <>
        <PageHeader title={t('pulse.title')} />
        <Card>
          <EmptyState icon={<Activity strokeWidth={1.75} />} title={t('unavailableTitle')} description={t('unavailable')} />
        </Card>
      </>
    );
  }

  const fill = pulse.todayCapacity ? Math.round((pulse.todayBooked / pulse.todayCapacity) * 100) : null;
  const totalMembers = MEMBERSHIP_STATES.reduce((sum, s) => sum + (pulse!.byState[s] ?? 0), 0);

  return (
    <>
      <PageHeader title={t('pulse.title')} description={t('pulse.description')} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t('pulse.activeMembers')} value={pulse.byState.active ?? 0} hint={t('pulse.ofTotal', { total: totalMembers })} />
        <StatTile
          label={t('pulse.avgAttendance')}
          value={pulse.avgAttendance === null ? '—' : `${Math.round(pulse.avgAttendance)}%`}
          hint={t('pulse.activeOnly')}
        />
        <StatTile
          label={t('pulse.todayFill')}
          value={fill === null ? '—' : `${fill}%`}
          hint={t('pulse.todayHint', { booked: pulse.todayBooked, capacity: pulse.todayCapacity, classes: pulse.todayClasses })}
        />
        <StatTile
          label={t('pulse.overdueInvoices')}
          value={overdue === null ? '—' : overdue}
          tone={overdue ? 'warning' : 'neutral'}
          hint={t('pulse.openLeads', { count: openLeads })}
        />
      </div>

      <section className={`${PANEL} mt-4`} aria-labelledby="pulse-states">
        <p id="pulse-states" className="eyebrow mb-3">
          {t('pulse.byState')}
        </p>
        <ul className="space-y-2">
          {MEMBERSHIP_STATES.map((s) => {
            const count = pulse!.byState[s] ?? 0;
            const pct = totalMembers ? Math.round((count / totalMembers) * 100) : 0;
            return (
              <li key={s}>
                <Link href={withParams('/dashboard/contacts', { state: s })} className="grid grid-cols-[96px_minmax(0,1fr)_48px] items-center gap-3 text-[12px]">
                  <span>{t(`memberState.${s}`)}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-inset" aria-hidden>
                    <span className="block h-full rounded-full bg-[color:var(--color-fg)]" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-end font-mono tabular-nums">{count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
