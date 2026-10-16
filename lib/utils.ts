import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function formatCurrency(
  amount: number | string,
  currency = 'USD',
  locale = 'en-US',
): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatNumber(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatDate(date: Date | string | null | undefined, withTime = false): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const minutes = Math.round(diff / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** E.164-ish normalization. Good enough for dedupe + Twilio dialling. */
export function normalizePhone(phone: string | null | undefined, defaultCountry = '+1'): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export function truncate(text: string, length = 120): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1).trimEnd()}…`;
}

export function safeJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

export function startOfDayUTC(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/**
 * Midnight today in the given IANA timezone, as a UTC instant.
 *
 * Due dates are a *day*, not a moment: a task due at 9am today is not overdue
 * at 9:01. Comparing against `new Date()` makes the count disagree with the
 * by-day grouping the UI shows, which reads as a phantom overdue item.
 */
export function startOfDayInZone(timezone: string, date = new Date()): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    // How far the zone is from UTC right now, derived rather than assumed, so
    // DST is handled without a table.
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') % 24,
      get('minute'),
      get('second'),
    );
    const offset = asUtc - Math.floor(date.getTime() / 1000) * 1000;
    return new Date(Date.UTC(get('year'), get('month') - 1, get('day')) - offset);
  } catch {
    // Unknown zone — UTC midnight is a sane fallback.
    return startOfDayUTC(date);
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
