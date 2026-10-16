'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, CalendarPlus, Inbox, Receipt, Search, Sparkles, X } from 'lucide-react';
import { cn, relativeTime } from '@/lib/utils';
import type { ShellDesk } from './shell';

type PanelTab = 'plan' | 'act' | 'evidence' | 'history';
type Turn = { role: 'user' | 'agent'; text: string; error?: boolean };

const TABS: PanelTab[] = ['plan', 'act', 'evidence', 'history'];

/**
 * "Do For Me": the agent's view of the current front-desk context. Plan lists
 * what is due today, Evidence is the recent activity log, History is this
 * session's conversation with the workspace's active agent.
 */
export function AgentPanel({
  open,
  onClose,
  desk,
  sectionLabelKey,
  pendingPrompt,
}: {
  open: boolean | null;
  onClose: () => void;
  desk: ShellDesk;
  sectionLabelKey: string;
  pendingPrompt: { text: string; at: number } | null;
}) {
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  const [tab, setTab] = useState<PanelTab>('plan');
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(null);
  const historyEnd = useRef<HTMLDivElement>(null);

  const ask = async (text: string) => {
    const message = text.trim();
    if (!message || busy || !desk.agent) return;
    setTab('history');
    setDraft('');
    setBusy(true);
    setTurns((current) => [...current, { role: 'user', text: message }, { role: 'agent', text: '' }]);

    const patchLast = (update: (turn: Turn) => Turn) =>
      setTurns((current) => [...current.slice(0, -1), update(current[current.length - 1])]);

    try {
      const res = await fetch(`/api/agents/${desk.agent.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId: conversationId.current }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? t('agentError'));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const raw of events) {
          const lines = raw.split('\n');
          const event = lines.find((l) => l.startsWith('event: '))?.slice(7).trim();
          const dataLine = lines.find((l) => l.startsWith('data: '));
          if (!event || !dataLine) continue;
          let payload: { text?: string; message?: string; conversationId?: string };
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }
          if (event === 'meta' && payload.conversationId) conversationId.current = payload.conversationId;
          if (event === 'token' && payload.text) {
            const piece = payload.text;
            patchLast((turn) => ({ ...turn, text: turn.text + piece }));
          }
          if (event === 'error') {
            const msg = payload.message ?? t('agentError');
            patchLast((turn) => ({ ...turn, text: turn.text || msg, error: !turn.text }));
          }
        }
      }
    } catch (error) {
      patchLast((turn) => ({ ...turn, text: (error as Error).message || t('agentError'), error: true }));
    } finally {
      setBusy(false);
    }
  };

  // A ✦ button elsewhere asked something on the user's behalf.
  useEffect(() => {
    if (pendingPrompt) void ask(pendingPrompt.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt?.at]);

  useEffect(() => {
    historyEnd.current?.scrollIntoView({ block: 'end' });
  }, [turns, tab]);

  const sectionLabel = tNav(sectionLabelKey);

  return (
    <>
      {/* Below xl the panel floats over the page with a scrim. */}
      {open && (
        <div className="fixed inset-0 z-30 bg-scrim/50 xl:hidden" aria-hidden onClick={onClose} />
      )}
      <aside
        aria-label={t('doForMe')}
        className={cn(
          'w-[288px] shrink-0 flex-col border-s border-[color:var(--color-border)] bg-panel',
          'fixed inset-y-0 end-0 z-40 xl:static xl:z-auto',
          open === null ? 'hidden xl:flex' : open ? 'flex' : 'hidden',
        )}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Sparkles className="h-4 w-4 text-agent" strokeWidth={2} />
            {t('doForMe')}
          </h2>
          <button onClick={onClose} aria-label={t('closePanel')} className="rounded p-1 muted hover:text-[color:var(--color-fg)]">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div role="tablist" className="mx-5 mt-4 grid grid-cols-4 border-b border-[color:var(--color-border)]">
          {TABS.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'eyebrow -mb-px border-b py-2 text-center !text-[9px]',
                tab === key
                  ? 'border-[color:var(--color-fg)] !text-[color:var(--color-fg)]'
                  : 'border-transparent hover:!text-[color:var(--color-fg)]',
              )}
            >
              {t(key)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-thin">
          {tab === 'plan' && (
            <>
              <p className="eyebrow flex items-center gap-2 !text-live">
                <span className="h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
                {t('context', { section: sectionLabel })}
              </p>
              <h3 className="mb-4 mt-5 text-[19px] font-bold">{t('tasksDue', { count: desk.tasksDue.length })}</h3>
              <ul>
                {desk.tasksDue.map((task) => {
                  const overdue = task.dueAt ? new Date(task.dueAt).getTime() < Date.now() : false;
                  return (
                    <li key={task.id}>
                      <Link
                        href={task.contactId ? `/dashboard?member=${task.contactId}` : '/dashboard/tasks'}
                        className="flex items-start justify-between gap-3 border-b border-ink/70 py-3.5"
                      >
                        <span className="text-[12px] font-medium leading-snug">{task.title}</span>
                        <span className={cn('shrink-0 text-[11px]', overdue ? 'text-alert' : 'muted')}>
                          {overdue ? t('overdue') : t('open')}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {tab === 'act' && (
            <>
              <p className="mb-4 text-[12px] muted">{t('actHint')}</p>
              <ul className="space-y-2">
                {[
                  { href: '/dashboard/appointments', icon: CalendarPlus, label: t('newAppointment') },
                  { href: '/dashboard/invoices', icon: Receipt, label: t('newInvoice') },
                  { href: '/dashboard/inbox', icon: Inbox, label: tNav('inbox') },
                  { href: '/dashboard/leads', icon: Search, label: tNav('leads') },
                ].map((action) => (
                  <li key={action.href}>
                    <Link
                      href={action.href}
                      className="flex items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] px-3 py-2.5 text-[12px] font-medium transition-colors hover:bg-inset"
                    >
                      <action.icon className="h-4 w-4 muted" strokeWidth={1.75} />
                      {action.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === 'evidence' &&
            (desk.evidence.length ? (
              <ul>
                {desk.evidence.map((item) => (
                  <li key={item.id} className="border-b border-[color:var(--color-border)] py-3">
                    <p className="text-[12px] font-medium leading-snug">{item.title}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider muted">
                      {item.type} · {relativeTime(item.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] muted">{t('noEvidence')}</p>
            ))}

          {tab === 'history' && (
            <>
              {turns.length === 0 && <p className="text-[12px] muted">{t('historyEmpty')}</p>}
              <div className="space-y-3">
                {turns.map((turn, index) => (
                  <div
                    key={index}
                    className={cn(
                      'whitespace-pre-wrap rounded-lg px-3 py-2 text-[12px] leading-relaxed',
                      turn.role === 'user'
                        ? 'ms-6 bg-inset'
                        : turn.error
                          ? 'border border-alert/40 text-alert'
                          : 'border border-[color:var(--color-border)]',
                    )}
                  >
                    {turn.text || <span className="animate-pulse-dot muted">…</span>}
                  </div>
                ))}
                <div ref={historyEnd} />
              </div>
            </>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
          className="p-3"
        >
          {desk.agent ? (
            <div className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-1.5 ps-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('askAgent')}
                aria-label={t('askAgent')}
                disabled={busy}
                className="min-w-0 flex-1 bg-transparent text-[12px] placeholder:text-[color:var(--color-fg-muted)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                aria-label={t('send')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-agent text-[color:var(--color-agent-fg)] transition-opacity disabled:opacity-60"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>
          ) : (
            <Link href="/dashboard/agents" className="block rounded-lg border border-dashed border-[color:var(--color-border)] px-3 py-3 text-[12px] muted">
              {t('noAgentHint')}
            </Link>
          )}
        </form>
      </aside>
    </>
  );
}
