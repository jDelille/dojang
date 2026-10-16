import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  MessageSquare,
  Phone,
  Receipt,
  StickyNote,
} from 'lucide-react';
import { getCurrentUser, requireWorkspace } from '@/lib/session';
import { prisma } from '@/lib/db';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from '@/components/ui';
import { ContactActions } from '@/components/contacts/contact-actions';
import { formatCurrency, formatDate, formatDuration, relativeTime } from '@/lib/utils';
import { odooConfigured, searchRead } from '@/lib/odoo';
import { loadMember360 } from '@/lib/member360';
import { MEMBER_TABS, Member360View, type MemberTab } from '@/components/member360/member360';

// Numeric ids are Odoo members (Member 360); Roster's own contacts use cuids.
const isOdooMember = (id: string) => odooConfigured() && /^\d+$/.test(id);

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isOdooMember(id)) {
    const [row] = await searchRead<{ name: string }>('dojo.member', [['id', '=', Number(id)]], ['name'], { limit: 1 }).catch(() => []);
    return { title: row?.name ?? 'Member' };
  }
  // Scoped like the page itself — an unscoped lookup would put another
  // tenant's customer name in this tab's title.
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { title: 'Contact' };

  const contact = await prisma.contact.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { name: true },
  });
  return { title: contact?.name ?? 'Contact' };
}

const ACTIVITY_ICON: Record<string, typeof MessageSquare> = {
  message: MessageSquare,
  call: Phone,
  email: MessageSquare,
  appointment: CalendarDays,
  invoice: Receipt,
  note: StickyNote,
  stage_change: FileText,
  system: FileText,
};

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const t = await getTranslations('contactDetail');
  const { workspace, workspaceId } = await requireWorkspace();
  const { id } = await params;

  if (isOdooMember(id)) {
    const { tab } = await searchParams;
    let member;
    try {
      member = await loadMember360(Number(id));
    } catch (error) {
      console.error('[member360] Odoo read failed:', error);
      const to = await getTranslations('odoo');
      return <EmptyState title={to('unavailableTitle')} description={to('unavailable')} />;
    }
    if (!member) notFound();
    return (
      <Member360View
        member={member}
        tab={(MEMBER_TABS as readonly string[]).includes(tab ?? '') ? (tab as MemberTab) : 'overview'}
        timezone={workspace.timezone}
        currency={workspace.currency}
      />
    );
  }

  const contact = await prisma.contact.findFirst({
    where: { id, workspaceId },
    include: {
      lead: { select: { id: true, businessName: true, status: true } },
      deals: { include: { stage: true }, orderBy: { createdAt: 'desc' } },
      appointments: { orderBy: { startsAt: 'desc' }, take: 10 },
      invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
      calls: { orderBy: { createdAt: 'desc' }, take: 10 },
      conversations: {
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: { user: { select: { name: true } } },
      },
    },
  });

  if (!contact) notFound();

  const openDeal = contact.deals.find((d) => d.status === 'open');

  // Aggregate over every paid invoice, not just the 10 loaded for the
  // timeline above — otherwise a long-standing customer's lifetime value
  // silently stops growing after their tenth invoice.
  const paidTotal = await prisma.invoice.aggregate({
    where: { contactId: contact.id, workspaceId, status: 'paid' },
    _sum: { amount: true },
    _count: true,
  });
  const lifetimeValue = Number(paidTotal._sum.amount ?? 0);

  return (
    <>
      <Link
        href="/dashboard/contacts"
        className="mb-4 inline-flex items-center gap-1.5 text-xs muted transition-colors hover:text-[color:var(--color-fg)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />{t('allContacts')}</Link>

      <PageHeader
        title={contact.name}
        description={
          [contact.company, contact.email, contact.phone].filter(Boolean).join(' · ') || undefined
        }
        actions={
          <ContactActions
            contactId={contact.id}
            tags={contact.tags}
            optedOutSms={contact.optedOutSms}
            optedOutEmail={contact.optedOutEmail}
            conversationId={contact.conversations[0]?.id ?? null}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* ── Timeline ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title={t('activity')}
            description={t('everythingThatHasHappenedWith')}
          />
          {contact.activities.length ? (
            <ol className="divide-y divide-[color:var(--color-border)]">
              {contact.activities.map((activity) => {
                const Icon = ACTIVITY_ICON[activity.type] ?? FileText;
                return (
                  <li key={activity.id} className="flex gap-3 px-5 py-3.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-pill border border-[color:var(--color-border)]">
                      <Icon className="h-3.5 w-3.5 muted" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{activity.title}</p>
                        <time
                          className="shrink-0 text-xs muted"
                          dateTime={activity.createdAt.toISOString()}
                          title={formatDate(activity.createdAt, true)}
                        >
                          {relativeTime(activity.createdAt)}
                        </time>
                      </div>
                      {activity.body && (
                        <p className="mt-1 whitespace-pre-wrap text-xs muted">{activity.body}</p>
                      )}
                      {activity.user?.name && (
                        <p className="mt-1 text-[11px] muted">by {activity.user.name}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              icon={<StickyNote strokeWidth={1.75} />}
              title={t('nothingYet')}
              description={t('callsMessagesBookingsAndInvoices')}
            />
          )}
        </Card>

        {/* ── Side rail ─────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader title={t('summary')} />
            <CardBody className="space-y-2.5 text-xs">
              <Row
                label={t('lifetimeValue')}
                value={
                  <span>
                    {formatCurrency(lifetimeValue, workspace.currency)}
                    {paidTotal._count > 0 && (
                      <span className="muted">
                        {' '}
                        · {paidTotal._count} paid
                      </span>
                    )}
                  </span>
                }
              />
              <Row
                label={t('openDeal')}
                value={
                  openDeal ? (
                    <Link href="/dashboard/pipeline" className="underline underline-offset-4">
                      {openDeal.stage.name} · {formatCurrency(Number(openDeal.value), openDeal.currency)}
                    </Link>
                  ) : (
                    '—'
                  )
                }
              />
              <Row label={t('conversations')} value={contact.conversations.length} />
              <Row label={t('appointments')} value={contact.appointments.length} />
              <Row label={t('calls')} value={contact.calls.length} />
              <Row label={t('lastActivity')} value={relativeTime(contact.lastActivityAt)} />
              {contact.lead && (
                <Row
                  label={t('originalLead')}
                  value={
                    <Link
                      href={`/dashboard/leads/${contact.lead.id}`}
                      className="underline underline-offset-4"
                    >
                      {contact.lead.businessName}
                    </Link>
                  }
                />
              )}
            </CardBody>
          </Card>

          {contact.conversations.length > 0 && (
            <Card>
              <CardHeader
                title={t('conversations')}
                action={
                  <Link
                    href={`/dashboard/inbox?contact=${contact.id}`}
                    className="text-xs muted hover:text-[color:var(--color-fg)]"
                  >{t('openInbox')}</Link>
                }
              />
              <ul className="divide-y divide-[color:var(--color-border)]">
                {contact.conversations.slice(0, 5).map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href={`/dashboard/inbox?conversation=${conversation.id}`}
                      className="block px-5 py-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge>{conversation.channel}</Badge>
                        <span className="text-[11px] muted">
                          {relativeTime(conversation.lastMessageAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs muted">
                        {conversation.messages[0]?.body ?? 'No messages yet'}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {contact.appointments.length > 0 && (
            <Card>
              <CardHeader title={t('appointments')} />
              <ul className="divide-y divide-[color:var(--color-border)]">
                {contact.appointments.slice(0, 5).map((appointment) => (
                  <li key={appointment.id} className="px-5 py-3">
                    <p className="truncate text-sm">{appointment.title}</p>
                    <p className="text-xs muted">
                      {formatDate(appointment.startsAt, true)} · {appointment.status.replace('_', ' ')}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {contact.invoices.length > 0 && (
            <Card>
              <CardHeader title={t('invoices')} />
              <ul className="divide-y divide-[color:var(--color-border)]">
                {contact.invoices.slice(0, 5).map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-2 px-5 py-3">
                    <span className="font-mono text-xs">{invoice.number}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs tabular-nums">
                        {formatCurrency(Number(invoice.amount), invoice.currency)}
                      </span>
                      <Badge tone={invoice.status === 'paid' ? 'success' : 'neutral'}>
                        {invoice.status}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {contact.calls.length > 0 && (
            <Card>
              <CardHeader title={t('calls')} />
              <ul className="divide-y divide-[color:var(--color-border)]">
                {contact.calls.slice(0, 5).map((call) => (
                  <li key={call.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs">
                        {call.direction === 'in' ? 'Inbound' : 'Outbound'}
                        {call.missed && <span className="ms-1.5 text-alert">missed</span>}
                      </span>
                      <span className="text-xs muted">{formatDuration(call.durationSeconds)}</span>
                    </div>
                    {call.summary && <p className="mt-1 text-xs muted">{call.summary}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="muted">{label}</span>
      <span className="text-end font-medium">{value}</span>
    </div>
  );
}
