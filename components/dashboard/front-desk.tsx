'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ArrowRight, Pencil, Sparkles } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { useShell } from './shell';

export type DeskContext = {
  id: string;
  name: string;
  subtitle: string;
  active: boolean;
  billing: { owed: string; overdue: boolean } | null;
  nextBooking: string | null;
  openDeal: string | null;
  checkInId: string | null;
  paymentHref: string;
  messageHref: string;
};

export type QueueItem = {
  id: string;
  kind: 'replyNeeded' | 'paymentOverdue' | 'unconfirmed';
  who: string;
  href: string;
};

const CARD = 'rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-4 sm:p-5';
const OUTLINE_BTN =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-border)] px-3 text-[11px] font-semibold transition-colors hover:bg-inset';

export function FrontDesk({ context, queue }: { context: DeskContext | null; queue: QueueItem[] }) {
  const t = useTranslations('frontDesk');
  const { openPalette, askAgent } = useShell();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [checkedIn, setCheckedIn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkIn = async () => {
    if (!context?.checkInId) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${context.checkInId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!res.ok) throw new Error();
      setCheckedIn(context.checkInId);
      router.refresh();
    } catch {
      setError(t('checkInFailed'));
    } finally {
      setChecking(false);
    }
  };

  const isCheckedIn = !!context && checkedIn !== null && checkedIn === context.checkInId;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">{t('eyebrow')}</p>
        <p className="text-[12px] muted">{t('hint')}</p>
      </div>

      <button
        onClick={openPalette}
        className="mb-4 flex h-12 w-full items-center justify-between gap-3 rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] px-4 text-start text-[14px] muted transition-colors hover:text-[color:var(--color-fg)]"
      >
        <span className="truncate">{t('commandPlaceholder')}</span>
        <kbd className="shrink-0 rounded-md border border-[color:var(--color-border)] bg-inset px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className={CARD} aria-labelledby="active-context">
          <p id="active-context" className="eyebrow mb-4">
            {t('activeContext')}
          </p>

          {context ? (
            <>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-canvas)] font-mono text-[11px] font-semibold">
                  {initials(context.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-[19px] font-bold">{context.name}</h1>
                  {context.subtitle && <p className="truncate text-[13px] muted">{context.subtitle}</p>}
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase',
                    context.active ? 'border-success/60 text-success' : 'border-[color:var(--color-border)] muted',
                  )}
                >
                  {context.active ? t('active') : t('idle')}
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-2">
                <Stat
                  label={t('billing')}
                  value={context.billing ? t('owed', { amount: context.billing.owed }) : t('current')}
                  tone={context.billing?.overdue ? 'alert' : undefined}
                />
                <Stat label={t('nextBooking')} value={context.nextBooking ?? '—'} />
                <Stat label={t('openDeal')} value={context.openDeal ?? '—'} />
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={checkIn}
                  disabled={!context.checkInId || checking || isCheckedIn}
                  title={context.checkInId ? undefined : t('noBookingToday')}
                  className="inline-flex h-8 items-center rounded-md bg-accent px-4 text-[11px] font-semibold text-[color:var(--color-accent-fg)] transition-colors hover:bg-accent-dark disabled:opacity-50"
                >
                  {isCheckedIn ? t('checkedIn') : t('checkIn')}
                </button>
                <Link href="/dashboard/appointments" className={OUTLINE_BTN}>
                  {t('book')}
                </Link>
                <Link href={context.paymentHref} className={OUTLINE_BTN}>
                  {t('payment')}
                </Link>
                <Link href={context.messageHref} className={OUTLINE_BTN}>
                  {t('message')}
                </Link>
                <Link href={`/dashboard/contacts/${context.id}`} className={OUTLINE_BTN}>
                  <Pencil className="h-3 w-3" strokeWidth={2} />
                  {t('edit')}
                </Link>
                <button
                  onClick={() => askAgent(t('askAgentAbout', { name: context.name }))}
                  aria-label={t('askAgentAbout', { name: context.name })}
                  title={t('askAgentAbout', { name: context.name })}
                  className={cn(OUTLINE_BTN, 'px-2.5')}
                >
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
              {error && <p className="mt-3 text-[12px] text-alert">{error}</p>}
            </>
          ) : (
            <div className="py-6">
              <p className="text-[15px] font-semibold">{t('noContext')}</p>
              <p className="mt-1 text-[13px] muted">{t('noContextHint')}</p>
            </div>
          )}
        </section>

        <section className={cn(CARD, 'flex flex-col')} aria-labelledby="service-queue">
          <p id="service-queue" className="eyebrow mb-2">
            {t('serviceQueue')}
          </p>
          {queue.length ? (
            <ul className="flex-1">
              {queue.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-3 border-b border-[color:var(--color-border)] py-3.5 text-[12px]"
                  >
                    <span className="font-semibold">{t(item.kind)}</span>
                    <span className="truncate muted">{item.who}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex-1 py-3 text-[12px] muted">{t('queueEmpty')}</p>
          )}
          <Link href="/dashboard/inbox" className={cn(OUTLINE_BTN, 'mt-4 self-start')}>
            {t('openQueue')}
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'alert' }) {
  return (
    <div className="min-w-0 rounded-md bg-inset px-3 py-2.5">
      <dt className="truncate text-[10px] muted">{label}</dt>
      <dd className={cn('mt-1 truncate text-[11px] font-semibold', tone === 'alert' && 'text-alert')}>{value}</dd>
    </div>
  );
}
