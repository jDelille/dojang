'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Field, Input } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, useHubActions, useHubRead, when } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/** Ported from Jodi's ArchivedMembers. */

type Archived = {
  id: string;
  name: string;
  memberNumber: string;
  version: number;
  archivedAt: string;
  archivedBy: string | null;
  reason: string | null;
};
type ArchivedList = { members: Archived[]; more: boolean };

const TEXT = 'text-[13px]';
const SCOPE = 'archived';

export function ArchivedMembers() {
  return (
    <HubGate capability="members.archive">
      <ArchivedMembersScreen />
    </HubGate>
  );
}

function ArchivedMembersScreen() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  // Odoo requires query on every read, so it is sent even when empty.
  const list = useHubRead<ArchivedList>(`members/archived?query=${encodeURIComponent(search)}`);
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(list.reload);
  const [selected, setSelected] = useState<Archived | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);

  const result = feedback[SCOPE];
  const blocked = busy || locked;
  const rows = list.data?.members ?? [];

  useEffect(() => {
    if (selected || result) reviewRef.current?.focus({ preventScroll: true });
  }, [selected, result]);

  function choose(row: Archived) {
    clearFeedback(SCOPE);
    setSelected(row);
    setReason('');
    setConfirmed(false);
  }

  function closeReview() {
    setSelected(null);
    setReason('');
    setConfirmed(false);
  }

  async function restore() {
    if (!selected || !confirmed || !reason.trim() || blocked) return;
    const saved = await act(SCOPE, `members/${selected.id}/restore`, { reason: reason.trim() }, { expectedVersion: selected.version });
    // On an error the list is reloaded too, since the student may have changed.
    if (saved?.kind === 'error') await list.reload().catch(() => undefined);
    if (saved?.kind === 'success' || saved?.kind === 'error') closeReview();
  }

  async function checkResult() {
    const saved = await retry();
    if (saved?.kind === 'success') closeReview();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className={cn(PANEL, 'space-y-3')}>
        <p className={TEXT}>
          Archived students keep their attendance, rank and billing history in Odoo. They are hidden from rosters, the kiosk and new bookings.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(query.trim());
          }}
        >
          <div className="min-w-[200px] flex-1">
            <Field label="Find an archived student">
              <Input value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={blocked}>
            Search archive
          </Button>
        </form>
      </section>

      {list.loading && <Notice>Loading archived students from Odoo…</Notice>}
      {!list.loading && list.error && <Notice tone="alert">{explainHubError(list.error)}</Notice>}

      {list.data && (
        <section className={cn(PANEL, 'space-y-3')} aria-label="Archived students">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--color-border)] pb-3 last:border-b-0 last:pb-0"
            >
              <div className={TEXT}>
                <p className="font-semibold">
                  {row.name} · {row.memberNumber}
                </p>
                <p className="muted">
                  Archived {when(row.archivedAt)}
                  {row.archivedBy ? ` by ${row.archivedBy}` : ''}
                  {row.reason ? ` · ${row.reason}` : ''}
                </p>
              </div>
              <Button size="sm" variant="secondary" disabled={blocked} onClick={() => choose(row)}>
                Review restoring {row.name}
              </Button>
            </div>
          ))}
          {!rows.length && <p className={TEXT}>No archived students match.</p>}
          {list.data.more && <p className={cn(TEXT, 'muted')}>Showing the 50 most recently changed. Narrow your search.</p>}
        </section>
      )}

      <div ref={reviewRef} tabIndex={-1} aria-label="Archive action result" className="space-y-4">
        {selected && (
          <section className={cn(PANEL, 'space-y-3')} aria-label="Review restoring student">
            <h2 className="text-base font-semibold">Review before saving: restore {selected.name}?</h2>
            <p className={TEXT}>
              The student returns to the active directory, rosters and the kiosk. Bookings cancelled at archive are not re-created, and no
              membership is restarted.
            </p>
            <Field label="Reason for restoring">
              <Input value={reason} maxLength={500} disabled={blocked} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <label className={cn(TEXT, 'flex items-start gap-2')}>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                disabled={blocked}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I confirmed this student should be active again.
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={blocked || !confirmed || !reason.trim()} onClick={() => void restore()}>
                {busy ? 'Restoring…' : 'Confirm restore in Odoo'}
              </Button>
              <Button variant="ghost" disabled={blocked} onClick={closeReview}>
                Cancel
              </Button>
            </div>
          </section>
        )}

        {result?.kind === 'success' && (
          <Link href="/dashboard/contacts" className="text-[13px] font-semibold underline underline-offset-4">
            Back to members
          </Link>
        )}
        <Feedback value={result} busy={busy} onRetry={pendingIn(SCOPE) ? () => void checkResult() : undefined} />
      </div>
    </div>
  );
}
