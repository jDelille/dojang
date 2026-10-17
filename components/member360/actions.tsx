'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MoreHorizontal, Pencil, Sparkles } from 'lucide-react';
import { useShell } from '@/components/dashboard/shell';
import { cn } from '@/lib/utils';

const BTN = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--color-border)] px-3 text-[12px] font-semibold';

/**
 * Member actions. Do For Me and Book work today (Book opens the reviewed
 * Odoo booking screen). Check in, Message, Payment and Edit write to Odoo or
 * WhatsMax, and wait on staff routes there (check-in must go through the
 * kiosk flow's eligibility, locks and outbox).
 */
export function MemberActions({ memberId, name, prompt }: { memberId: string; name: string; prompt: string }) {
  const t = useTranslations('member360');
  const { askAgent } = useShell();
  const soon = t('actions.notConnected');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled title={soon} className={cn(BTN, 'border-transparent bg-[#e5172f] text-white opacity-60')}>
        {t('actions.checkIn')}
      </button>
      <button type="button" disabled title={soon} className={cn(BTN, 'opacity-60')}>
        {t('actions.message')}
      </button>
      <Link href={`/dashboard/contacts/${memberId}/book`} className={BTN}>
        {t('actions.book')}
      </Link>
      <button type="button" disabled title={soon} className={cn(BTN, 'opacity-60')}>
        {t('actions.payment')}
      </button>
      <button type="button" disabled title={soon} className={cn(BTN, 'opacity-60')}>
        <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
        {t('actions.edit')}
      </button>
      <button type="button" disabled title={soon} aria-label={t('actions.more')} className={cn(BTN, 'opacity-60')}>
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button type="button" onClick={() => askAgent(prompt)} className={BTN} aria-label={t('actions.doForMeFor', { name })}>
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
        {t('actions.doForMe')}
      </button>
    </div>
  );
}
