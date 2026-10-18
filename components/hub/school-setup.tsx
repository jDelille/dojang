'use client';

import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { HubGate, Notice, useHubRead } from '@/components/hub/hub-client';
import { ChecklistItems, type ChecklistItem } from '@/components/hub/checklist-items';
import { cn } from '@/lib/utils';

/** Ported from Jodi's SetupChecklist. Read only: nothing here changes Odoo settings. */

type Setup = { items: ChecklistItem[]; done: number; total: number };

export function SchoolSetup() {
  return (
    <HubGate capability="setup.read">
      <SchoolSetupScreen />
    </HubGate>
  );
}

function SchoolSetupScreen() {
  const setup = useHubRead<Setup>('school/setup');
  const data = setup.data;
  const percent = data && data.total ? Math.round((data.done / data.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {setup.loading && !data && <Notice>Checking setup…</Notice>}
      {!setup.loading && setup.error && <Notice tone="alert">{explainHubError(setup.error)}</Notice>}

      {data && (
        <section className={cn(PANEL, 'space-y-3')} aria-label="School setup">
          <p className="text-[13px] muted">
            Read from the live Odoo configuration. Nothing here changes settings; each item says where it is configured.
          </p>
          {/* "5 of 8 ready" with a thin progress bar */}
          <p className="text-[13px]">
            <strong>
              {data.done} of {data.total}
            </strong>{' '}
            ready
          </p>
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-pill bg-[color:var(--color-border)]">
            <div className="h-full bg-success" style={{ width: `${percent}%` }} />
          </div>
          <ChecklistItems items={data.items} />
        </section>
      )}
    </div>
  );
}
