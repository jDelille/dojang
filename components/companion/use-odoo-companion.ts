'use client';

import { useEffect, useRef, useState } from 'react';
import type { OdooContext, OdooReceipt, OdooSuggestion } from '@/lib/companion-odoo';

export type OdooStatus = 'loading' | 'online' | 'offline' | 'notConfigured';

// working: sent; done: receipt back; failed: Odoo said no, next try is new;
// notConfirmed: no usable answer, so the retry resends the same keys.
export type TaskStatus = 'working' | 'done' | 'failed' | 'notConfirmed';

export type OdooAnswer =
  | { outcome: 'answer'; answer: string; mode: string }
  | { outcome: 'notUnderstood' }
  | { outcome: 'unavailable' };

type Command = { memberId: string; suggestionId: string; idempotencyKey: string; correlationId: string };

const newKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

/** Which Odoo records the current page is about. */
export function scopeFromPage(pathname: string, session: string | null) {
  const member = pathname.match(/^\/dashboard\/contacts\/(\d+)$/)?.[1] ?? null;
  const onClasses = pathname.startsWith('/dashboard/instructor') || pathname.startsWith('/dashboard/appointments');
  const sessionId = !member && onClasses && session && /^\d+$/.test(session) ? session : null;
  return { memberId: member, sessionId, key: member ? `member:${member}` : sessionId ? `session:${sessionId}` : 'desk' };
}

/**
 * The Odoo half of the Companion (v1's dock): context per page, read-only
 * answers, follow-up drafts and approvals with receipts.
 */
export function useOdooCompanion(scope: { memberId: string | null; sessionId: string | null; key: string }) {
  const [status, setStatus] = useState<OdooStatus>('loading');
  const [context, setContext] = useState<(OdooContext & { key: string }) | null>(null);
  const [prepared, setPrepared] = useState<Record<string, OdooSuggestion[]>>({});
  const [taskStatus, setTaskStatus] = useState<Record<string, TaskStatus>>({});
  const [receipts, setReceipts] = useState<OdooReceipt[]>([]);
  const [revision, setRevision] = useState(0);
  const inFlight = useRef(new Set<string>());
  const unconfirmed = useRef(new Map<string, Command>());

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (scope.memberId) params.set('memberId', scope.memberId);
    if (scope.sessionId) params.set('sessionId', scope.sessionId);
    setStatus('loading');
    fetch(`/api/companion/context?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { status: OdooStatus } & OdooContext) => {
        setStatus(data.status);
        setContext(data.status === 'online' ? { ...data, key: scope.key } : null);
      })
      .catch(() => !controller.signal.aborted && setStatus('offline'));
    return () => controller.abort();
  }, [scope.key, scope.memberId, scope.sessionId, revision]);

  const live = context?.key === scope.key ? context : null;
  const suggestions = [...(prepared[scope.key] ?? []), ...(live?.suggestions ?? [])].filter(
    (s, i, all) => all.findIndex((o) => o.id === s.id) === i,
  );

  const ask = async (text: string): Promise<OdooAnswer> => {
    try {
      const res = await fetch('/api/companion/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, memberId: scope.memberId, sessionId: scope.sessionId }),
      });
      return res.ok ? await res.json() : { outcome: 'unavailable' };
    } catch {
      return { outcome: 'unavailable' };
    }
  };

  /** Returns an error code, or null once the draft is waiting for approval. */
  const prepare = async (input: { sessionId: string; text: string; idempotencyKey: string; correlationId: string }) => {
    if (!scope.memberId) return 'INVALID_COMMAND';
    const pageKey = scope.key;
    try {
      const res = await fetch('/api/companion/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, memberId: scope.memberId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.suggestion) return (data?.error as string) ?? 'unavailable';
      setPrepared((all) => ({ ...all, [pageKey]: [data.suggestion, ...(all[pageKey] ?? [])] }));
      return null;
    } catch {
      return 'unavailable';
    }
  };

  const approve = async (suggestion: OdooSuggestion) => {
    if (!scope.memberId) return;
    const taskKey = `${scope.key}:${suggestion.id}`;
    if (inFlight.current.has(taskKey) || taskStatus[suggestion.id] === 'done') return;
    inFlight.current.add(taskKey);

    const command = unconfirmed.current.get(taskKey) ?? {
      memberId: scope.memberId,
      suggestionId: suggestion.id,
      idempotencyKey: newKey('companion'),
      correlationId: newKey('companion'),
    };
    setTaskStatus((all) => ({ ...all, [suggestion.id]: 'working' }));

    let outcome: TaskStatus = 'notConfirmed';
    try {
      const res = await fetch('/api/companion/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.receipt) {
        outcome = 'done';
        setReceipts((all) => [data.receipt, ...all.filter((r) => r.id !== data.receipt.id || r.suggestionId !== data.receipt.suggestionId)]);
      } else if (res.status >= 400 && res.status < 500) {
        outcome = 'failed';
      }
    } catch {
      // Network error: it may have run, so keep the command for the retry.
    }

    inFlight.current.delete(taskKey);
    if (outcome === 'notConfirmed') unconfirmed.current.set(taskKey, command);
    else unconfirmed.current.delete(taskKey);
    setTaskStatus((all) => ({ ...all, [suggestion.id]: outcome }));
    if (outcome === 'done') setRevision((r) => r + 1);
  };

  return {
    status,
    context: live,
    suggestions,
    taskStatus,
    receipts,
    ask,
    prepare,
    approve,
    refresh: () => setRevision((r) => r + 1),
  };
}
