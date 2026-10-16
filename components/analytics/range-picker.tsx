'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';
import { DEFAULT_RANGE, RANGES } from '@/lib/ranges';

/**
 * Time-range filter. Sits in one row above the charts and drives every
 * figure on the page through the `range` search param, so a shared link
 * reproduces exactly what the sender was looking at.
 */
export function RangePicker({ active }: { active: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const select = (days: number) => {
    const next = new URLSearchParams(params.toString());
    if (days === DEFAULT_RANGE) next.delete('range');
    else next.set('range', String(days));
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };

  return (
    <div
      role="group"
      aria-label="Time range"
      className={cn(
        'inline-flex rounded-control border border-[color:var(--color-border)] p-0.5',
        pending && 'opacity-60',
      )}
    >
      {RANGES.map((r) => {
        const selected = r.days === active;
        return (
          <button
            key={r.days}
            type="button"
            aria-pressed={selected}
            aria-label={r.full}
            onClick={() => select(r.days)}
            className={cn(
              'rounded-[4px] px-2.5 py-1 text-xs font-medium transition-colors duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              selected
                ? 'bg-accent text-[color:var(--color-accent-fg)]'
                : 'muted hover:text-[color:var(--color-fg)]',
            )}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
