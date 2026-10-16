import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n/config';

/**
 * Resolves the active locale per request from the cookie, falling back to
 * English. next-intl needs this registered in next.config.mjs.
 */
export async function resolveLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const value = store.get('roster-locale')?.value;
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    // Called outside a request scope (build-time render) — English is right.
    return DEFAULT_LOCALE;
  }
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Formatting follows the locale too: Arabic numerals, date order and
    // currency placement all differ, and translating text while leaving
    // 08/14/2026 in place is a half-done job.
    now: new Date(),
  };
});
