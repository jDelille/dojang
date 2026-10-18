import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Ported from Jodi's ChecklistItems (SetupChecklist.tsx). Used by School setup and member onboarding. */

export type ChecklistItem = { key: string; label: string; done: boolean; detail: string; where: string };

const ROW = 'space-y-1 border-t border-[color:var(--color-border)] pt-3 first:border-t-0 first:pt-0';

/** One row per item: done mark, name, Ready/Needs attention, detail, and where to set it when not ready. */
export function ChecklistItems({ items }: { items: ChecklistItem[] }) {
  return (
    <ul aria-label="Checklist" className="space-y-2">
      {items.map((item) => (
        <li key={item.key} className={ROW} aria-label={`${item.label}: ${item.done ? 'done' : 'needs attention'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-[13px]">
              <span aria-hidden="true">{item.done ? '✓' : '!'}</span> {item.label}
            </strong>
            <Badge tone={item.done ? 'success' : 'warning'}>{item.done ? 'Ready' : 'Needs attention'}</Badge>
          </div>
          <p className={cn('text-[13px]', 'muted')}>{item.detail}</p>
          {!item.done && <p className="text-[12px] muted">Where: {item.where}</p>}
        </li>
      ))}
    </ul>
  );
}
