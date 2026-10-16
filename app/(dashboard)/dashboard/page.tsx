import { requireWorkspace } from '@/lib/session';
import { prisma } from '@/lib/db';
import { formatCurrency, startOfDayInZone } from '@/lib/utils';
import { FrontDesk, type DeskContext, type QueueItem } from '@/components/dashboard/front-desk';
import { AcademyToday, type AcademyData } from '@/components/dashboard/academy-today';
import { odooConfigured } from '@/lib/odoo';
import { loadArrivals, loadMemberCard, loadTodayClasses } from '@/lib/academy';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Today' };

/**
 * Today — the front desk. One active context (the contact picked from
 * Arriving soon, ⌘K, or a Do For Me task) plus the service queue of things
 * waiting on a person.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; booking?: string; class?: string; dojoMember?: string }>;
}) {
  const params = await searchParams;
  const { workspace, workspaceId } = await requireWorkspace();
  const tz = workspace.timezone;
  const now = new Date();
  const dayStart = startOfDayInZone(tz);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  // Who is in context: the requested contact, else the next arrival, else
  // whoever was active most recently.
  let memberId = params.member ?? null;
  if (memberId) {
    const owned = await prisma.contact.findFirst({ where: { id: memberId, workspaceId }, select: { id: true } });
    memberId = owned?.id ?? null;
  }
  if (!memberId) {
    const next = await prisma.appointment.findFirst({
      where: { workspaceId, startsAt: { gte: new Date(now.getTime() - 3_600_000) }, status: { in: ['scheduled', 'confirmed'] } },
      orderBy: { startsAt: 'asc' },
      select: { contactId: true },
    });
    memberId = next?.contactId ?? null;
  }
  if (!memberId) {
    const recent = await prisma.contact.findFirst({
      where: { workspaceId },
      orderBy: [{ lastActivityAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { id: true },
    });
    memberId = recent?.id ?? null;
  }

  const [academy, context, needsHuman, overdueInvoices, unconfirmed] = await Promise.all([
    odooConfigured() ? loadAcademy(dayStart, dayEnd, now, params.class, params.dojoMember) : null,
    memberId ? loadContext(workspaceId, memberId, params.booking ?? null, { tz, now, dayStart, dayEnd, currency: workspace.currency }) : null,
    prisma.conversation.findMany({
      where: { workspaceId, isOpen: true, needsHuman: true },
      orderBy: { lastMessageAt: 'desc' },
      take: 3,
      select: { id: true, contact: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { workspaceId, status: 'overdue' },
      orderBy: { dueAt: 'asc' },
      take: 3,
      select: { id: true, contact: { select: { name: true } } },
    }),
    prisma.appointment.findMany({
      where: { workspaceId, status: 'scheduled', startsAt: { gte: now, lt: new Date(now.getTime() + 2 * 86_400_000) } },
      orderBy: { startsAt: 'asc' },
      take: 3,
      select: { id: true, contactId: true, contact: { select: { name: true } } },
    }),
  ]);

  const queue: QueueItem[] = [
    ...needsHuman.map((c) => ({
      id: `conv-${c.id}`,
      kind: 'replyNeeded' as const,
      who: c.contact?.name ?? 'Website visitor',
      href: `/dashboard/inbox?conversation=${c.id}`,
    })),
    ...overdueInvoices.map((i) => ({
      id: `inv-${i.id}`,
      kind: 'paymentOverdue' as const,
      who: i.contact.name,
      href: `/dashboard/invoices/${i.id}`,
    })),
    ...unconfirmed.map((a) => ({
      id: `appt-${a.id}`,
      kind: 'unconfirmed' as const,
      who: a.contact.name,
      href: `/dashboard?member=${a.contactId}&booking=${a.id}`,
    })),
  ].slice(0, 5);

  return (
    <>
      {academy && <AcademyToday data={academy} timezone={tz} />}
      <FrontDesk context={context} queue={queue} />
    </>
  );
}

/**
 * Odoo side of the front desk: today's classes, the picked class's arrivals
 * (else the next class still running) and the picked member.
 */
async function loadAcademy(
  dayStart: Date,
  dayEnd: Date,
  now: Date,
  classParam: string | undefined,
  memberParam: string | undefined,
): Promise<AcademyData> {
  try {
    const classes = await loadTodayClasses(dayStart, dayEnd);
    const picked = Number(classParam);
    const selected =
      classes.find((c) => c.id === picked) ??
      classes.find((c) => !c.done && new Date(c.endsAt) > now) ??
      null;
    const memberId = Number(memberParam);
    const [arrivals, member] = await Promise.all([
      selected ? loadArrivals(selected.id) : [],
      Number.isInteger(memberId) && memberId > 0 ? loadMemberCard(memberId) : null,
    ]);
    return { ok: true, classes, selectedId: selected?.id ?? null, arrivals, member };
  } catch (error) {
    console.error('[academy] Odoo read failed:', (error as Error).message);
    return { ok: false };
  }
}

async function loadContext(
  workspaceId: string,
  contactId: string,
  bookingId: string | null,
  env: { tz: string; now: Date; dayStart: Date; dayEnd: Date; currency: string },
): Promise<DeskContext | null> {
  const [contact, unpaid, nextBooking, checkIn, deal, conversation] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true, name: true, company: true, tags: true, lastActivityAt: true },
    }),
    prisma.invoice.findMany({
      where: { workspaceId, contactId, status: { in: ['sent', 'overdue'] } },
      select: { id: true, amount: true, currency: true, status: true },
    }),
    prisma.appointment.findFirst({
      where: { workspaceId, contactId, startsAt: { gte: env.now }, status: { in: ['scheduled', 'confirmed'] } },
      orderBy: { startsAt: 'asc' },
      select: { startsAt: true },
    }),
    // The booking to check in: the one picked from Arriving soon, else this
    // contact's open booking today.
    prisma.appointment.findFirst({
      where: {
        workspaceId,
        contactId,
        status: { in: ['scheduled', 'confirmed'] },
        ...(bookingId ? { id: bookingId } : { startsAt: { gte: env.dayStart, lt: env.dayEnd } }),
      },
      orderBy: { startsAt: 'asc' },
      select: { id: true },
    }),
    prisma.deal.findFirst({
      where: { workspaceId, contactId, status: 'open' },
      orderBy: { updatedAt: 'desc' },
      select: { value: true, currency: true },
    }),
    prisma.conversation.findFirst({
      where: { workspaceId, contactId },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    }),
  ]);
  if (!contact) return null;

  const owed = unpaid.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const recentlyActive =
    !!nextBooking ||
    (contact.lastActivityAt ? env.now.getTime() - contact.lastActivityAt.getTime() < 30 * 86_400_000 : false);

  const subtitle = [
    contact.company && contact.company !== contact.name ? contact.company : null,
    ...contact.tags.map((tag) => tag.charAt(0).toUpperCase() + tag.slice(1)),
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    id: contact.id,
    name: contact.name,
    subtitle,
    active: recentlyActive,
    billing: owed > 0 ? { owed: formatCurrency(owed, unpaid[0]?.currency ?? env.currency), overdue: unpaid.some((i) => i.status === 'overdue') } : null,
    nextBooking: nextBooking ? bookingLabel(nextBooking.startsAt, env.tz, env.now) : null,
    openDeal: deal ? formatCurrency(Number(deal.value), deal.currency) : null,
    checkInId: checkIn?.id ?? null,
    paymentHref: unpaid.length === 1 ? `/dashboard/invoices/${unpaid[0].id}` : '/dashboard/invoices',
    messageHref: conversation ? `/dashboard/inbox?conversation=${conversation.id}` : '/dashboard/inbox',
  };
}

/** "5:45 PM" today, "Fri 5:45 PM" otherwise — in the workspace's zone. */
function bookingLabel(date: Date, timeZone: string, now: Date) {
  try {
    const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
    const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
    if (ymd(date) === ymd(now)) return time;
    const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
    return `${day} ${time}`;
  } catch {
    return date.toLocaleString();
  }
}
