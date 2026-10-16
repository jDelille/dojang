/**
 * Time-range options, shared by the server page and the client picker.
 *
 * Deliberately NOT in range-picker.tsx: that file is 'use client', and a
 * server component calling a function exported from a client module throws
 * at runtime ("Attempted to call parseRange() from the server"). Only the
 * component itself needs to be a client boundary — these are plain data.
 */

export const RANGES = [
  { days: 7, label: '7d', full: 'Last 7 days' },
  { days: 30, label: '30d', full: 'Last 30 days' },
  { days: 90, label: '90d', full: 'Last 90 days' },
  { days: 365, label: '12m', full: 'Last 12 months' },
] as const;

export const DEFAULT_RANGE = 30;

/** Clamp an arbitrary `?range=` to one we actually offer. */
export function parseRange(value?: string | string[]): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const days = Number(raw);
  return RANGES.some((r) => r.days === days) ? days : DEFAULT_RANGE;
}

export function rangeLabel(days: number) {
  return RANGES.find((r) => r.days === days)?.full ?? `Last ${days} days`;
}

/**
 * Bucket size for a range, so the chart caption and the data agree.
 * A year of daily points is ~1.5px each — noise, not a trend.
 */
export function bucketDaysFor(days: number) {
  return days > 180 ? 7 : days > 90 ? 3 : 1;
}

export function grainLabel(days: number) {
  const b = bucketDaysFor(days);
  return b === 7 ? 'Weekly' : b === 3 ? 'Every 3 days' : 'Daily';
}
