/**
 * Locale configuration.
 *
 * Deliberately cookie-driven rather than URL-segmented (`/en/…`, `/ar/…`).
 * The dashboard sits behind authentication, so there is no SEO case for locale
 * in the path — and a `[locale]` segment would restructure every route, every
 * redirect and every link in the product for no benefit to the buyer.
 */

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_COOKIE = 'roster-locale';

export const LOCALE_META: Record<
  Locale,
  { label: string; nativeLabel: string; dir: 'ltr' | 'rtl' }
> = {
  en: { label: 'English', nativeLabel: 'English', dir: 'ltr' },
  ar: { label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function directionOf(locale: string): 'ltr' | 'rtl' {
  return isLocale(locale) ? LOCALE_META[locale].dir : 'ltr';
}
