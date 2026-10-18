'use client';

import Link from 'next/link';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { PANEL } from '@/components/odoo/shared';
import { Badge, Button } from '@/components/ui';
import { Notice, when } from '@/components/hub/hub-client';
import { useOdooCompanion } from '@/components/companion/use-odoo-companion';
import { cn } from '@/lib/utils';

/**
 * Ported from Jodi's follow-ups page (ConnectedWorkflowView historyOnly, PR #17).
 * Read only: lists the follow-ups staff reviewed and saved. New ones are
 * prepared from a member's Companion ("Prepare parent follow-up").
 *
 * Reads the Companion's Odoo context (the kiosk staff gateway, like v1),
 * not the Hub: the Hub has no follow-up operation yet.
 */

const PAGE_SCOPE = { memberId: null, sessionId: null, key: 'follow-ups' };

export function FollowUps() {
  const odoo = useOdooCompanion(PAGE_SCOPE);
  const followUps = odoo.context?.followUps ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={odoo.refresh} disabled={odoo.status === 'loading'}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {odoo.status === 'loading' && <Notice>Loading Odoo records…</Notice>}
      {odoo.status === 'notConfigured' && <Notice tone="alert">Odoo is not connected on this server.</Notice>}
      {odoo.status === 'offline' && (
        <Notice tone="alert">Couldn’t load staff records. Odoo could not be reached; try Refresh.</Notice>
      )}

      {odoo.status === 'online' && (
        <section className={cn(PANEL, 'space-y-3')} aria-label="Reviewed follow-ups">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[14px] font-semibold">Reviewed follow-ups</h2>
            {followUps.length > 0 && <span className="text-[12px] muted">{followUps.length} saved</span>}
          </div>

          {followUps.length === 0 ? (
            <div className="text-[13px]">
              <p className="font-semibold">No approved follow-ups yet.</p>
              <p className="muted">Open a member and use “Prepare parent follow-up” in the Companion.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {followUps.map((followUp) => (
                <li key={followUp.id} className="rounded-lg border border-[color:var(--color-border)] p-3 text-[13px]">
                  {/* Name on the left, date and status on the right */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/dashboard/contacts/${followUp.memberId}`} className="font-semibold hover:underline">
                      {followUp.memberName}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] muted">{when(followUp.at)}</span>
                      <Badge>{followUp.status}</Badge>
                    </div>
                  </div>

                  <p className="mt-2">{followUp.summary}</p>

                  <details className="group mt-2">
                    <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium">
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
                      Reviewed reply draft
                    </summary>
                    <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-[color:var(--color-border)] pl-3">
                      {followUp.replyDraft}
                    </blockquote>
                    <p className="mt-1 text-[11px] muted">{followUp.mode}</p>
                  </details>

                  <Link
                    href={`/dashboard/instructor?session=${followUp.sessionId}`}
                    className="mt-2 inline-block text-[12px] font-medium hover:underline"
                  >
                    Open class roster <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
