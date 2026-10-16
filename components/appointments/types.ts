/** Shapes and constants shared by the Appointments panels. */

export type Appointment = {
  id: string;
  title: string;
  notes: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  reminderSent: boolean;
  bookedByAgent: boolean;
  calendarEventId: string | null;
  contact: { id: string; name: string; email: string | null; phone: string | null };
};

export type CalendarAccount = { id: string; provider: string; accountEmail: string };

export type RangeMode = 'week' | 'month' | 'custom';

export const STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'] as const;

export const STATUS_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'alert' | 'info'> = {
  scheduled: 'accent',
  confirmed: 'info',
  completed: 'success',
  cancelled: 'alert',
  no_show: 'alert',
};

export const PAST_PER_PAGE = 10;

/** A month grid is six weeks at most, so wider ranges stay list-only. */
export const MAX_GRID_DAYS = 42;

/**
 * The API speaks UTC ISO strings; <input type="datetime-local"> speaks the
 * viewer's wall clock. Converting through local components keeps a slot
 * labeled 10:00 from being booked at 10:00 UTC.
 */

/* ── Date helpers ─────────────────────────────────────────────────────────
 * Shared by the list, the month grid and the modal. Deliberately local-time:
 * appointments are wall-clock events, and a UTC round trip would move a slot
 * labeled 10:00 to 10:00 UTC.
 */

export const pad = (n: number) => String(n).padStart(2, '0');
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};
export const startOfWeek = (d: Date) => {
  const s = startOfDay(d);
  // Monday-first, which is what European rotas expect.
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
};
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toDateTimeInput = (value: string | Date) => {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const parseDateInput = (value: string, fallback: Date) => {
  const d = new Date(`${value}T00:00`);
  return Number.isNaN(d.getTime()) ? startOfDay(fallback) : startOfDay(d);
};
export const timeOnly = (value: string) =>
  new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const statusLabel = (status: string) => status.replace('_', ' ');
