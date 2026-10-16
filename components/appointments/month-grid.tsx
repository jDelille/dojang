'use client';
import { addDays, startOfMonth, startOfWeek } from '@/components/appointments/types';
import { MAX_GRID_DAYS, timeOnly, toDateInput } from '@/components/appointments/types';

import { cn } from '@/lib/utils';
import type { Appointment } from '@/components/appointments/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthGrid({
  from,
  to,
  appointments,
  onSelect,
}: {
  from: Date;
  to: Date;
  appointments: Appointment[];
  onSelect: (appointment: Appointment) => void;
}) {
  const gridStart = startOfWeek(from);
  const gridEnd = addDays(startOfWeek(addDays(to, -1)), 7);
  const days: Date[] = [];
  for (let d = gridStart; d < gridEnd && days.length < MAX_GRID_DAYS; d = addDays(d, 1)) {
    days.push(d);
  }

  const byDay = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const key = toDateInput(new Date(a.startsAt));
    const list = byDay.get(key);
    if (list) list.push(a);
    else byDay.set(key, [a]);
  }

  const todayKey = toDateInput(new Date());

  return (
    <div className="relative overflow-x-auto px-5 pb-5">
      <div className="min-w-[42rem]">
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-1.5 text-center text-xs font-medium muted">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px rounded-card bg-[color:var(--color-border)] p-px">
          {days.map((day) => {
            const key = toDateInput(day);
            const inRange = day >= from && day < to;
            const items = byDay.get(key) ?? [];
            return (
              <div
                key={key}
                className={`min-h-[6rem] bg-[color:var(--color-bg)] p-1.5 ${
                  inRange ? '' : 'opacity-45'
                }`}
              >
                <p
                  className={`px-1 text-xs tabular-nums ${
                    key === todayKey ? 'font-semibold text-accent-dark' : 'muted'
                  }`}
                >
                  <span className="sr-only">
                    {day.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                    {items.length ? `, ${items.length} appointment` : ', no appointments'}
                    {items.length > 1 ? 's' : ''}
                  </span>
                  <span aria-hidden>{day.getDate()}</span>
                </p>
                <ul className="mt-1 space-y-1">
                  {items.slice(0, 3).map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(a)}
                        className="w-full truncate rounded-control border border-[color:var(--color-border)] px-1.5 py-1 text-start text-xs transition-colors hover:border-accent"
                      >
                        <span className="tabular-nums muted">{timeOnly(a.startsAt)}</span>{' '}
                        {a.title}
                      </button>
                    </li>
                  ))}
                  {items.length > 3 && (
                    <li className="px-1.5 text-xs muted">+{items.length - 3} more</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
