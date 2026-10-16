import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, Circle, Clock, X } from 'lucide-react';
import type { RosterEntry } from '@/lib/academy';
import { cn, startOfDayInZone } from '@/lib/utils';

/**
 * Small server-rendered pieces shared by the Odoo-backed pages. State lives
 * in the URL, so filters and paging are plain links.
 */

export const PANEL = 'rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-4 sm:p-5';

export function withParams(path: string, params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '' && !(key === 'page' && Number(value) <= 1)) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export function Chips({ label, items }: { label: string; items: { key: string; label: string; href: string; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5 border-b border-[color:var(--color-border)] px-4 py-2.5">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px]',
            item.active ? 'border-[color:var(--color-fg)] font-semibold' : 'border-[color:var(--color-border)] muted',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function LinkPager({
  page,
  pages,
  summary,
  href,
  labels,
}: {
  page: number;
  pages: number;
  summary: string;
  href: (page: number) => string;
  labels: { previous: string; next: string; nav: string };
}) {
  return (
    <nav
      aria-label={labels.nav}
      className="flex items-center justify-between gap-3 border-t border-[color:var(--color-border)] px-4 py-2.5 text-xs"
    >
      <span className="muted tabular-nums">{summary}</span>
      {pages > 1 && (
        <span className="flex items-center gap-1.5">
          <PagerLink href={page > 1 ? href(page - 1) : null} label={labels.previous}>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} />
          </PagerLink>
          <PagerLink href={page < pages ? href(page + 1) : null} label={labels.next}>
            <ChevronRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} />
          </PagerLink>
        </span>
      )}
    </nav>
  );
}

function PagerLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const cls = 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-border)]';
  return href ? (
    <Link href={href} aria-label={label} className={cls}>
      {children}
    </Link>
  ) : (
    <span aria-disabled="true" aria-label={label} className={cn(cls, 'opacity-40')}>
      {children}
    </span>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'success' | 'alert' | 'warning' }) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase',
        tone === 'success' && 'border-success/60 text-success',
        tone === 'alert' && 'border-alert/60 text-alert',
        tone === 'warning' && 'border-warning/60 text-warning',
        tone === 'neutral' && 'border-[color:var(--color-border)] muted',
      )}
    >
      {children}
    </span>
  );
}

export function formatIn(iso: string, timezone: string, options: Intl.DateTimeFormatOptions, locale = 'en-US') {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(new Date(iso));
  }
}

/** Midnight-to-midnight bounds of the day `offsetDays` from today, in the workspace timezone. */
export function dayBounds(timezone: string, offsetDays = 0) {
  // Noon avoids landing on the wrong day across a DST change.
  const ref = new Date(startOfDayInZone(timezone).getTime() + offsetDays * 86_400_000 + 12 * 3_600_000);
  const start = startOfDayInZone(timezone, ref);
  return { start, end: startOfDayInZone(timezone, new Date(start.getTime() + 36 * 3_600_000)) };
}

export function RosterList({
  roster,
  empty,
  labels,
}: {
  roster: RosterEntry[];
  empty: string;
  labels: { present: string; absent: string; excused: string; pending: string; waitlist: string };
}) {
  if (!roster.length) return <p className="py-2 text-[12px] muted">{empty}</p>;
  return (
    <ul>
      {roster.map((r) => {
        const Icon = r.attendance === 'present' ? Check : r.attendance === 'absent' ? X : r.attendance === 'excused' ? Clock : Circle;
        const label = labels[r.attendance as keyof typeof labels] ?? labels.pending;
        return (
          <li key={r.memberId} className="flex items-center gap-2.5 border-b border-[color:var(--color-border)] py-2 text-[12px]">
            <Icon
              className={cn('h-3.5 w-3.5 shrink-0', r.attendance === 'present' ? 'text-success' : r.attendance === 'absent' ? 'text-alert' : 'muted')}
              strokeWidth={2.25}
              aria-label={label}
            />
            <Link href={`/dashboard/contacts/${r.memberId}`} className="min-w-0 flex-1 truncate">
              {r.name}
            </Link>
            {r.waitlist && <Pill>{labels.waitlist}</Pill>}
          </li>
        );
      })}
    </ul>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-inset px-3 py-2.5">
      <dt className="truncate text-[10px] muted">{label}</dt>
      <dd className="mt-1 truncate text-[11px] font-semibold">{value}</dd>
    </div>
  );
}
