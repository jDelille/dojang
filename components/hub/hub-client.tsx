'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Link2 } from 'lucide-react';
import { Button, Card, EmptyState, LoadingBlock } from '@/components/ui';
import { callApi, explainHubError, newRequestKey, runHubAction, type ActionFeedback } from '@/lib/hub-actions';
import type { Capability } from '@/lib/domain/capabilities';
import { cn } from '@/lib/utils';

/**
 * Client side of the Hub screens ported from Jodi's Companion. Every write
 * follows Jodi's rule: one idempotency key per intended action, kept until
 * Odoo confirms it. If the result is unclear, the same action (same key) is
 * the only thing staff can retry; a different write is refused until then.
 */

type PendingAction = {
  path: string;
  payload: Record<string, unknown>;
  expectedVersion?: number;
  idempotencyKey: string;
  /** Which screen or card shows the result, e.g. "attendance" or "member:12". */
  scope: string;
};

type HubActionsValue = {
  pending: React.MutableRefObject<PendingAction | null>;
  hasPending: boolean;
  setPending: (action: PendingAction | null) => void;
};

const HubActionsContext = createContext<HubActionsValue | null>(null);

/** Keeps an unconfirmed action (and its key) while staff move between pages. */
export function HubActionsProvider({ children }: { children: ReactNode }) {
  const pending = useRef<PendingAction | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const setPending = useCallback((action: PendingAction | null) => {
    pending.current = action;
    setHasPending(Boolean(action));
  }, []);

  useEffect(() => {
    if (!hasPending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasPending]);

  return <HubActionsContext.Provider value={{ pending, hasPending, setPending }}>{children}</HubActionsContext.Provider>;
}

export type ActOptions = { expectedVersion?: number };
export type Act = (scope: string, path: string, payload: Record<string, unknown>, options?: ActOptions) => Promise<ActionFeedback | undefined>;

/**
 * Runs Hub writes for one screen. `refresh` reloads the screen's data after
 * Odoo confirms a write; a failed reload never turns a saved write into an
 * error.
 */
export function useHubActions(refresh: () => Promise<unknown>) {
  const context = useContext(HubActionsContext);
  if (!context) throw new Error('Hub screens need HubActionsProvider in the dashboard layout');
  const { pending, hasPending, setPending } = context;
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, ActionFeedback>>({});
  const inFlight = useRef(false);

  const clearFeedback = useCallback((scope: string) => {
    setFeedback((previous) => {
      const next = { ...previous };
      delete next[scope];
      return next;
    });
  }, []);

  const act: Act = async (scope, path, payload, options = {}) => {
    if (inFlight.current) return;
    const show = (value: ActionFeedback) => setFeedback((previous) => ({ ...previous, [scope]: value }));

    const current = pending.current;
    const sameAction =
      current && JSON.stringify([current.path, current.payload, current.expectedVersion]) === JSON.stringify([path, payload, options.expectedVersion]);
    if (current && !sameAction) {
      show({ kind: 'error', text: explainHubError('PENDING_ACTION') });
      return;
    }
    const command: PendingAction = current ?? {
      path,
      payload,
      expectedVersion: options.expectedVersion,
      idempotencyKey: newRequestKey(path.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40) || 'hub'),
      scope,
    };
    if (!current) setPending(command);

    inFlight.current = true;
    setBusy(true);
    clearFeedback(scope);
    try {
      const body: Record<string, unknown> = { idempotencyKey: command.idempotencyKey, payload: command.payload };
      if (command.expectedVersion !== undefined) body.expectedVersion = command.expectedVersion;
      const result = await runHubAction(
        () => callApi(command.path, body),
        async () => {
          await refresh();
        },
        (accepted) => {
          setPending(null);
          show(accepted);
        },
      );
      if (result.kind !== 'uncertain') setPending(null);
      show(result);
      return result;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const retry = async () => {
    const command = pending.current;
    if (!command) return;
    return act(command.scope, command.path, command.payload, { expectedVersion: command.expectedVersion });
  };

  /** True when the unconfirmed action belongs to `scope`, so that card can offer the retry. */
  const pendingIn = (scope: string) => hasPending && pending.current?.scope === scope;

  return { act, busy, locked: hasPending, feedback, clearFeedback, retry, pendingIn };
}

/** Loads one /api/v2 read. `path` null waits (for example until a choice is made). */
export function useHubRead<T = Record<string, unknown>>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const latest = useRef(path);

  const reload = useCallback(async () => {
    if (!path) return null;
    latest.current = path;
    const value = await callApi<T>(path);
    if (latest.current === path) {
      setData(value);
      setError(null);
    }
    return value;
  }, [path]);

  useEffect(() => {
    let cancelled = false;
    latest.current = path;
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    callApi<T>(path)
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setError(null);
        }
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, error, loading, reload, setData };
}

/** A preview read (nothing saved), e.g. what an archive or a refund would change. */
export function preview<T = Record<string, unknown>>(path: string, payload: Record<string, unknown>) {
  return callApi<T>(path, { payload });
}

type Me = { role: string; capabilities: Capability[] };
const MeContext = createContext<Me | null>(null);

/** The signed-in staff member's hub role and capabilities, inside a HubGate. */
export function useHubMe() {
  const me = useContext(MeContext);
  if (!me) throw new Error('useHubMe needs a HubGate');
  return { ...me, can: (capability: Capability) => me.capabilities.includes(capability) };
}

/**
 * Shows a Hub screen only when this staff member's own Odoo account is
 * connected and their hub role allows `capability`. Otherwise explains what
 * to do (connect in Settings, or ask a manager).
 */
export function HubGate({ capability, children }: { capability?: Capability; children: ReactNode }) {
  const { data, error, loading } = useHubRead<Me>('me');
  if (loading) return <LoadingBlock label="Checking your Odoo access…" />;
  if (error === 'SIGN_IN_REQUIRED' || error === 'HUB_NOT_CONFIGURED') {
    return (
      <Card>
        <EmptyState
          icon={<Link2 strokeWidth={1.75} />}
          title={error === 'HUB_NOT_CONFIGURED' ? 'Odoo is not connected' : 'Connect your Odoo account'}
          description={
            error === 'HUB_NOT_CONFIGURED'
              ? 'This school has no Odoo connection configured yet.'
              : 'This page works with your own Odoo account, so Odoo can check what your role may do. Connect it in Settings.'
          }
          action={
            error === 'SIGN_IN_REQUIRED' ? (
              <Link href="/dashboard/settings" className="text-sm font-semibold underline underline-offset-4">
                Open Settings
              </Link>
            ) : undefined
          }
        />
      </Card>
    );
  }
  if (error || !data) return <Notice tone="alert">{explainHubError(error ?? 'BACKEND_UNAVAILABLE')}</Notice>;
  if (capability && !data.capabilities.includes(capability)) {
    return <Notice tone="alert">Your role ({data.role}) does not include this page. Ask a manager if you need it.</Notice>;
  }
  return <MeContext.Provider value={data}>{children}</MeContext.Provider>;
}

/** A short status or alert line. */
export function Notice({ tone = 'neutral', children }: { tone?: 'neutral' | 'alert' | 'success'; children: ReactNode }) {
  return (
    <p
      role={tone === 'alert' ? 'alert' : 'status'}
      className={cn(
        'rounded-control border px-3 py-2 text-[13px]',
        tone === 'alert' && 'border-alert/40 text-alert',
        tone === 'success' && 'border-success/40',
        tone === 'neutral' && 'border-[color:var(--color-border)] muted',
      )}
    >
      {children}
    </p>
  );
}

/** The result of one write, with the same-key retry when Odoo's answer was unclear. */
export function Feedback({ value, onRetry, busy }: { value?: ActionFeedback; onRetry?: () => void; busy?: boolean }) {
  if (!value) return null;
  return (
    <div
      role={value.kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'space-y-2 rounded-control border px-3 py-2 text-[13px]',
        value.kind === 'success' ? 'border-success/40' : 'border-warning/50',
      )}
    >
      <p>{value.text}</p>
      {value.refreshWarning && <p className="muted">{value.refreshWarning}</p>}
      {value.kind === 'uncertain' && onRetry && (
        <Button size="sm" disabled={busy} onClick={onRetry}>
          Check the result again
        </Button>
      )}
    </div>
  );
}

/** Odoo dates to local text. */
export const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : '');
export const day = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString() : '');
export const money = (value: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
