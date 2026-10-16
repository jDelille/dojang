import { searchRead } from '@/lib/odoo';
import { loadSessionRoster, loadTodayClasses } from '@/lib/academy';
import { countOverdueInvoices } from '@/lib/odoo-invoices';
import { loadMember360, memberInsight } from '@/lib/member360';
import { dayBounds } from '@/components/odoo/shared';

/**
 * Companion brief (§10, §31): what needs attention, as structured cards.
 *
 * Deterministic tier (§36): plain rules over Odoo reads, no model call and no
 * writes. Cards carry translation keys and params; the panel renders them.
 * "Act" only asks the agent for a draft — staff still decide and do.
 */

type Params = Record<string, string | number>;

export type CompanionCard = {
  id: string; // stable for the same finding, so Dismiss sticks
  kind:
    | 'notHere'
    | 'nearlyFull'
    | 'overdueInvoices'
    | 'trialNoShows'
    | 'member.testInvite'
    | 'member.promotionReview'
    | 'member.reachOut'
    | 'member.signWaiver';
  tone: 'alert' | 'info';
  params: Params;
  records: { label?: string; navKey?: string; href: string }[];
  reviewHref: string;
};

export type CompanionChip = { key: string; params?: Params };

export type CompanionBrief = { cards: CompanionCard[]; chips: CompanionChip[] };

const NEARLY_FULL = 0.9;
const MAX_LISTED = 4;

function timeIn(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso));
}

async function todayCards(timezone: string): Promise<CompanionCard[]> {
  const { start, end } = dayBounds(timezone);
  const now = Date.now();
  const [classes, overdue, noShows] = await Promise.all([
    loadTodayClasses(start, end),
    countOverdueInvoices(),
    searchRead<{ id: number; contact_name: string | false; name: string }>(
      'crm.lead',
      [['no_show', '=', true], ['is_converted', '=', false], ['stage_id.is_won', '=', false]],
      ['contact_name', 'name'],
      { limit: 20, order: 'create_date desc' },
    ),
  ]);

  const cards: CompanionCard[] = [];

  // The class running now or next: who is booked but not here yet.
  const current = classes.find((c) => new Date(c.endsAt).getTime() > now && !c.done);
  if (current) {
    const missing = (await loadSessionRoster(current.id)).filter(
      (r) => !r.waitlist && r.attendance !== 'present' && r.attendance !== 'late',
    );
    if (missing.length) {
      cards.push({
        id: `notHere:${current.id}:${missing.length}`,
        kind: 'notHere',
        tone: new Date(current.startsAt).getTime() <= now ? 'alert' : 'info',
        params: {
          count: missing.length,
          className: current.name,
          time: timeIn(current.startsAt, timezone),
          names: missing.slice(0, MAX_LISTED).map((r) => r.name).join(', '),
        },
        records: [
          { label: current.name, href: `/dashboard/instructor?session=${current.id}` },
          ...missing.slice(0, MAX_LISTED).map((r) => ({ label: r.name, href: `/dashboard/contacts/${r.memberId}` })),
        ],
        reviewHref: `/dashboard/instructor?session=${current.id}`,
      });
    }
  }

  for (const c of classes) {
    if (c.done || !c.capacity || c.booked / c.capacity < NEARLY_FULL) continue;
    cards.push({
      id: `nearlyFull:${c.id}:${c.booked}`,
      kind: 'nearlyFull',
      tone: 'info',
      params: { className: c.name, time: timeIn(c.startsAt, timezone), booked: c.booked, capacity: c.capacity },
      records: [{ label: c.name, href: `/dashboard/appointments?session=${c.id}` }],
      reviewHref: `/dashboard/appointments?session=${c.id}`,
    });
  }

  if (overdue) {
    cards.push({
      id: `overdueInvoices:${overdue}`,
      kind: 'overdueInvoices',
      tone: 'alert',
      params: { count: overdue },
      records: [{ navKey: 'invoices', href: '/dashboard/invoices?filter=overdue' }],
      reviewHref: '/dashboard/invoices?filter=overdue',
    });
  }

  if (noShows.length) {
    cards.push({
      id: `trialNoShows:${noShows.map((l) => l.id).join('-')}`,
      kind: 'trialNoShows',
      tone: 'info',
      params: {
        count: noShows.length,
        names: noShows.slice(0, MAX_LISTED).map((l) => l.contact_name || l.name).join(', '),
      },
      records: noShows.slice(0, MAX_LISTED).map((l) => ({ label: l.contact_name || l.name, href: '/dashboard/leads' })),
      reviewHref: '/dashboard/leads',
    });
  }

  return cards;
}

async function memberCard(memberId: number): Promise<{ card: CompanionCard | null; name: string } | null> {
  const member = await loadMember360(memberId);
  if (!member) return null;
  const insight = memberInsight(member);
  const href = `/dashboard/contacts/${member.id}`;
  if (!insight.suggestion) return { card: null, name: member.name };
  return {
    name: member.name,
    card: {
      id: `member.${insight.suggestion}:${member.id}`,
      kind: `member.${insight.suggestion}`,
      tone: insight.suggestion === 'reachOut' ? 'alert' : 'info',
      params: {
        name: member.name,
        days: insight.daysSinceClass ?? 0,
        readiness: insight.testingReadiness ?? 0,
        rank: member.rank ?? '',
      },
      records: [{ label: member.name, href }],
      reviewHref: href,
    },
  };
}

/** Cards and chips for the page at `path`. Member pages lead with that member. */
export async function loadCompanionBrief(path: string, timezone: string): Promise<CompanionBrief> {
  const memberMatch = path.match(/^\/dashboard\/contacts\/(\d+)$/);

  if (memberMatch) {
    const [member, today] = await Promise.all([memberCard(Number(memberMatch[1])), todayCards(timezone)]);
    if (member) {
      const first = member.name.split(' ')[0];
      return {
        cards: [...(member.card ? [member.card] : []), ...today],
        chips: [
          { key: 'memberSummary', params: { name: first } },
          { key: 'memberAttendance', params: { name: first } },
          { key: 'memberDraft', params: { name: first } },
        ],
      };
    }
  }

  const cards = await todayCards(timezone);
  const chips: CompanionChip[] = path.startsWith('/dashboard/instructor') || path.startsWith('/dashboard/appointments')
    ? [{ key: 'whoNotHere' }, { key: 'lessonPlan' }, { key: 'nearlyFull' }]
    : path.startsWith('/dashboard/leads') || path.startsWith('/dashboard/pipeline')
      ? [{ key: 'followUpLeads' }, { key: 'trialNoShows' }, { key: 'leadSources' }]
      : path.startsWith('/dashboard/invoices')
        ? [{ key: 'overdueSummary' }, { key: 'paymentReminder' }]
        : [{ key: 'needsAttention' }, { key: 'todayClasses' }, { key: 'atRisk' }];
  return { cards, chips };
}
