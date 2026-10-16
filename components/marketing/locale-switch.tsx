'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ChevronDown, Globe } from 'lucide-react';
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';

/**
 * Public language picker.
 *
 * A native <select> rather than a custom menu: it scales to any number of
 * languages without a scroll implementation, gets keyboard and screen-reader
 * behavior for free, and opens the OS picker on mobile.
 *
 * A visitor has no account to hold a preference, so this writes the same
 * cookie the dashboard reads — pick Arabic here and you stay in Arabic after
 * signing in. It reloads rather than client-navigating because `dir` lives on
 * <html> and is rendered on the server.
 */
export function LocaleSwitch() {
  const active = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (locale: Locale) => {
    if (locale === active) return;
    document.cookie = `roster-locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <div
      className={cn(
        'relative hidden items-center rounded-control border border-[color:var(--color-border)] sm:inline-flex',
        'focus-within:border-accent focus-within:ring-1 focus-within:ring-accent',
        pending && 'opacity-60',
      )}
    >
      <Globe className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 muted" strokeWidth={1.75} aria-hidden />
      <select
        aria-label="Language"
        value={active}
        disabled={pending}
        onChange={(e) => change(e.target.value as Locale)}
        className="h-8 cursor-pointer appearance-none bg-transparent ps-8 pe-7 text-xs font-medium text-[color:var(--color-fg)] focus:outline-none"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_META[code].nativeLabel}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute end-2 h-3.5 w-3.5 muted" strokeWidth={1.75} aria-hidden />
    </div>
  );
}
