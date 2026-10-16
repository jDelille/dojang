'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ChevronRight, Mic, X } from 'lucide-react';
import type { Role } from '@prisma/client';
import { cn } from '@/lib/utils';
import type { CompanionCard } from '@/lib/companion';
import type { OdooSession, OdooSuggestion } from '@/lib/companion-odoo';
import type { ShellDesk } from '@/components/dashboard/shell';
import { useAgentChat } from './use-agent-chat';
import { useHoldToTalk } from './use-hold-to-talk';
import { scopeFromPage, useOdooCompanion, type TaskStatus } from './use-odoo-companion';

type BriefStatus = 'loading' | 'online' | 'offline' | 'notConfigured';
type Brief = { status: BriefStatus; cards: CompanionCard[] };
type Tab = 'plan' | 'evidence' | 'history';

const DISMISSED_KEY = 'roster-companion-dismissed';
const TABS: Tab[] = ['plan', 'evidence', 'history'];

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/**
 * Do For Me (vercel-design-1.png): the page's context, the tasks due, and one
 * Ask box. Tasks come from two places:
 *  - Odoo's companion workflow (v1's dock): attendance review and parent
 *    follow-ups, approved here with a receipt;
 *  - rules over Odoo reads (/api/companion/brief), acted on by the agent.
 * Questions go to Odoo first (read-only, scoped); the workspace agent answers
 * what Odoo can't. Nothing here sends a message or books a class.
 */
export function CompanionPanel({
  open,
  onClose,
  desk,
  pendingPrompt,
}: {
  open: boolean | null;
  onClose: () => void;
  desk: ShellDesk;
  user: { name: string | null; role: Role };
  pendingPrompt: { text: string; at: number } | null;
}) {
  const t = useTranslations('companion');
  const tShell = useTranslations('shell');
  const tNav = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const session = useSearchParams().get('session');

  const scope = useMemo(() => scopeFromPage(pathname, session), [pathname, session]);
  const odoo = useOdooCompanion(scope);
  const chat = useAgentChat(desk.agent?.id ?? null, tShell('agentError'));

  const [tab, setTab] = useState<Tab>('plan');
  const [brief, setBrief] = useState<Brief>({ status: 'loading', cards: [] });
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);
  const busy = asking || chat.busy;

  useEffect(() => setDismissed(readDismissed()), []);

  useEffect(() => {
    let live = true;
    fetch(`/api/companion/brief?path=${encodeURIComponent(pathname)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Brief) => live && setBrief(data))
      .catch(() => live && setBrief({ status: 'offline', cards: [] }));
    return () => {
      live = false;
    };
  }, [pathname]);

  useEffect(() => setOpenId(null), [scope.key]);

  const cards = brief.cards.filter((c) => !dismissed.includes(c.id));
  const cardText = (card: CompanionCard, part: 'title' | 'context' | 'finding' | 'act' | 'prompt') =>
    t(`cards.${card.kind}.${part}`, card.params);

  // Page facts the agent can't see on its own, sent with each question.
  const withContext = (question: string) => {
    if (!brief.cards.length) return question;
    const facts = brief.cards.map((c) => `- ${cardText(c, 'title')}: ${cardText(c, 'context')}. ${cardText(c, 'finding')}`);
    return `${question}\n\n${t('contextHeader')}\n${facts.join('\n')}`;
  };

  /** Drafting goes to the agent; Odoo's ask only explains. */
  const draftWithAgent = (text: string) => {
    setTab('plan');
    void chat.ask(text, withContext(text), t('agentMode'));
  };

  /** Odoo answers first from scoped records; the agent covers what it can't. */
  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setDraft('');
    setTab('plan');
    if (odoo.status !== 'online') {
      if (desk.agent) void chat.ask(question, withContext(question), t('agentMode'));
      else chat.add({ role: 'user', text: question }, { role: 'agent', text: t('ask.unavailable'), error: true });
      return;
    }
    setAsking(true);
    chat.add({ role: 'user', text: question });
    const reply = await odoo.ask(question);
    setAsking(false);
    if (reply.outcome === 'answer') {
      chat.add({ role: 'agent', text: reply.answer, mode: reply.mode });
    } else if (desk.agent) {
      void chat.ask(question, withContext(question), t('agentMode'), false);
    } else {
      chat.add({ role: 'agent', text: t(`ask.${reply.outcome}`), error: true });
    }
  };

  const voice = useHoldToTalk(locale === 'ar' ? 'ar' : 'en-US', setDraft, ask);

  // A ✦ button elsewhere (Member 360, front desk) asked on the user's behalf.
  useEffect(() => {
    if (pendingPrompt) void ask(pendingPrompt.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt?.at]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'end' });
  }, [chat.turns]);

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-200);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: dismissed for this page view only.
    }
  };

  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id));
  const taskCount = odoo.suggestions.filter((s) => odoo.taskStatus[s.id] !== 'done').length + cards.length;
  const scopeKind = scope.memberId ? 'member' : scope.sessionId ? 'session' : 'desk';
  const loading = odoo.status === 'loading' && brief.status === 'loading';
  const connected = odoo.status === 'online' || brief.status === 'online';

  return (
    <>
      {/* Below xl the panel floats over the page with a scrim. */}
      {open && <div className="fixed inset-0 z-30 bg-scrim/50 xl:hidden" aria-hidden onClick={onClose} />}
      <aside
        aria-label={t('title')}
        className={cn(
          'w-[320px] shrink-0 flex-col border-s border-[color:var(--color-border)] bg-panel',
          'fixed inset-y-0 end-0 z-40 xl:static xl:z-auto',
          open === null ? 'hidden xl:flex' : open ? 'flex' : 'hidden',
        )}
      >
        <div className="flex items-center justify-between px-4 pt-5">
          <h2 className="flex items-center gap-2 text-[14px] font-bold">
            <span className="text-agent" aria-hidden>
              ✦
            </span>
            {t('title')}
          </h2>
          <button onClick={onClose} aria-label={tShell('closePanel')} className="rounded p-1 muted hover:text-[color:var(--color-fg)]">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div role="tablist" className="mx-4 mt-4 flex border-b border-[color:var(--color-border)]">
          {TABS.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'eyebrow -mb-px flex-1 border-b py-2 text-center text-[9px] transition-colors',
                tab === id ? 'border-[color:var(--color-fg)] text-[color:var(--color-fg)]' : 'border-transparent muted hover:text-[color:var(--color-fg)]',
              )}
            >
              {t(`tabs.${id}`)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-6 scrollbar-thin">
          {tab === 'plan' && (
            <>
              <p className={cn('eyebrow flex items-center gap-2 text-[9px]', connected ? 'text-live' : 'muted')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-live' : 'bg-[color:var(--color-fg-muted)]')} aria-hidden />
                {t(`scope.${scopeKind}`)}
                {!connected && !loading && <span className="normal-case tracking-normal">· {t(`status.${odoo.status === 'loading' ? brief.status : odoo.status}`)}</span>}
              </p>
              <h3 className="mt-3 text-[20px] font-bold leading-tight">
                {loading ? t('status.loading') : t('tasksDue', { count: taskCount })}
              </h3>

              <ul className="mt-4">
                {odoo.suggestions.map((s) => (
                  <li key={s.id}>
                    <TaskRow title={s.title} open={openId === s.id} onToggle={() => toggle(s.id)} state={stateLabel(t, odoo.taskStatus[s.id])} openLabel={t('open')}>
                      <SuggestionDetail
                        suggestion={s}
                        status={odoo.taskStatus[s.id]}
                        onApprove={() => void odoo.approve(s)}
                        retryLabel={t('task.retry')}
                        failedNote={t('task.failedNote')}
                        retryNote={t('task.retryNote')}
                      />
                    </TaskRow>
                  </li>
                ))}
                {cards.map((card) => (
                  <li key={card.id}>
                    <TaskRow title={cardText(card, 'title')} open={openId === card.id} onToggle={() => toggle(card.id)} openLabel={t('open')} tone={card.tone}>
                      <p className="text-[11px] muted">{cardText(card, 'context')}</p>
                      <p className="mt-1.5 text-[12px] leading-snug">{cardText(card, 'finding')}</p>
                      <p className="mt-2 text-[10px] muted">{t('cost')}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => draftWithAgent(cardText(card, 'prompt'))}
                          disabled={!desk.agent || busy}
                          className="rounded-md bg-[color:var(--color-fg)] px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--color-bg)] disabled:opacity-60"
                        >
                          {cardText(card, 'act')}
                        </button>
                        <Link href={card.reviewHref} className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 text-[11px] font-medium hover:bg-inset">
                          {t('review')}
                        </Link>
                        <button type="button" onClick={() => dismiss(card.id)} className="ms-auto px-1.5 py-1.5 text-[11px] muted hover:text-[color:var(--color-fg)]">
                          {t('dismiss')}
                        </button>
                      </div>
                    </TaskRow>
                  </li>
                ))}
                {scope.memberId && odoo.context?.followUpEnabled && (
                  <li>
                    <TaskRow title={t('followUp.title')} open={openId === 'followup-form'} onToggle={() => toggle('followup-form')} openLabel={t('open')}>
                      <FollowUpForm
                        key={scope.key}
                        sessions={odoo.context.sessions}
                        onPrepare={odoo.prepare}
                        onReady={() => setOpenId(null)}
                      />
                    </TaskRow>
                  </li>
                )}
              </ul>

              {chat.turns.length > 0 && (
                <section className="mt-6" aria-label={t('conversation')}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="eyebrow text-[9px]">{t('conversation')}</p>
                    <button type="button" onClick={chat.clear} disabled={busy} className="text-[11px] muted hover:text-[color:var(--color-fg)]">
                      {t('clear')}
                    </button>
                  </div>
                  <div className="space-y-3" aria-live="polite">
                    {chat.turns.map((turn, index) => (
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
                        {turn.mode && !turn.error && <p className="eyebrow mb-1 text-[9px] text-agent">{turn.mode}</p>}
                        {turn.text || <span className="animate-pulse-dot muted">…</span>}
                      </div>
                    ))}
                    {asking && <div className="animate-pulse-dot rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-[12px] muted">…</div>}
                    <div ref={threadEnd} />
                  </div>
                </section>
              )}
            </>
          )}

          {tab === 'evidence' && <Evidence odoo={odoo} cards={cards} cardText={cardText} tNav={tNav} />}
          {tab === 'history' && <History odoo={odoo} />}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
          className="p-4"
        >
          <div className="flex items-center gap-1.5 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-1.5 ps-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={voice.listening ? t('listening') : t('ask.placeholder')}
              aria-label={t('ask.placeholder')}
              disabled={busy}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[12px] placeholder:text-[color:var(--color-fg-muted)] focus:outline-none"
            />
            {voice.supported && (
              <button
                type="button"
                aria-label={t('holdToTalk')}
                title={t('holdToTalk')}
                disabled={busy}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  voice.start();
                }}
                onPointerUp={voice.stop}
                onPointerCancel={voice.stop}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                    e.preventDefault();
                    voice.start();
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') voice.stop();
                }}
                aria-pressed={voice.listening}
                className={cn('rounded-lg p-2 transition-colors disabled:opacity-60', voice.listening ? 'bg-agent/15 text-agent' : 'muted hover:text-[color:var(--color-fg)]')}
              >
                <Mic className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            )}
            <button
              type="submit"
              aria-label={t('ask.send')}
              disabled={busy || !draft.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-agent text-white transition-opacity disabled:opacity-50"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

type T = ReturnType<typeof useTranslations>;
type OdooApi = ReturnType<typeof useOdooCompanion>;

function stateLabel(t: T, status: TaskStatus | undefined) {
  return status ? t(`task.${status}`) : undefined;
}

/** One line of the task list, as in the mockup: title left, Open right. */
function TaskRow({
  title,
  open,
  onToggle,
  openLabel,
  state,
  tone,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  openLabel: string;
  state?: string;
  tone?: 'alert' | 'info';
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[color:var(--color-border)]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 py-3 text-start">
        {tone === 'alert' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alert" aria-hidden />}
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{title}</span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] muted">
          {state ?? openLabel}
          <ChevronRight className={cn('h-3 w-3 transition-transform rtl:rotate-180', open && 'rotate-90 rtl:rotate-90')} strokeWidth={2} />
        </span>
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

function SuggestionDetail({
  suggestion,
  status,
  onApprove,
  retryLabel,
  failedNote,
  retryNote,
}: {
  suggestion: OdooSuggestion;
  status: TaskStatus | undefined;
  onApprove: () => void;
  retryLabel: string;
  failedNote: string;
  retryNote: string;
}) {
  return (
    <>
      <p className="text-[12px] leading-snug">{suggestion.explanation}</p>
      <dl className="mt-3 space-y-1.5">
        {suggestion.preview.map((p) => (
          <div key={p.label} className="rounded-md bg-inset px-2.5 py-1.5">
            <dt className="text-[10px] muted">{p.label}</dt>
            <dd className="whitespace-pre-wrap text-[11px]">{p.value}</dd>
          </div>
        ))}
      </dl>
      {status !== 'done' && (
        <button
          type="button"
          onClick={onApprove}
          disabled={status === 'working'}
          className="mt-3 rounded-md bg-[color:var(--color-fg)] px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--color-bg)] disabled:opacity-60"
        >
          {status === 'notConfirmed' ? retryLabel : suggestion.actionLabel}
        </button>
      )}
      {status === 'failed' && <p className="mt-2 text-[11px] text-alert">{failedNote}</p>}
      {status === 'notConfirmed' && <p className="mt-2 text-[11px] muted">{retryNote}</p>}
    </>
  );
}

/** v1's "Prepare parent follow-up": a staff-entered report becomes a draft for review. */
function FollowUpForm({
  sessions,
  onPrepare,
  onReady,
}: {
  sessions: OdooSession[];
  onPrepare: OdooApi['prepare'];
  onReady: () => void;
}) {
  const t = useTranslations('companion.followUp');
  const [sessionId, setSessionId] = useState('');
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same keys on a retry of the same report, so Odoo can't make it twice.
  const attempt = useRef<{ idempotencyKey: string; correlationId: string } | null>(null);

  const changed = () => {
    attempt.current = null;
    setConfirmed(false);
    setError(null);
  };
  const ready = !busy && confirmed && !!sessionId && !!message.trim();

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        attempt.current ??= { idempotencyKey: `followup-${crypto.randomUUID()}`, correlationId: `followup-${crypto.randomUUID()}` };
        setBusy(true);
        const problem = await onPrepare({ sessionId, text: message.trim(), ...attempt.current });
        setBusy(false);
        if (problem) {
          setError(t.has(`errors.${problem}`) ? t(`errors.${problem}`) : t('errors.unavailable'));
          return;
        }
        attempt.current = null;
        setMessage('');
        setConfirmed(false);
        onReady();
      }}
    >
      <p className="text-[11px] muted">{t('intro')}</p>
      <label className="block text-[11px] font-medium">
        {t('session')}
        <select
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.target.value);
            changed();
          }}
          className="mt-1 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] px-2 py-1.5 text-[11px] font-normal"
        >
          <option value="">{t('sessionPlaceholder')}</option>
          {sessions.map((s) => (
            <option key={s.sessionId} value={s.sessionId}>
              {s.title} · {new Date(s.startsAt).toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[11px] font-medium">
        {t('report')}
        <textarea
          rows={3}
          maxLength={1500}
          value={message}
          placeholder={t('reportPlaceholder')}
          onChange={(e) => {
            setMessage(e.target.value);
            changed();
          }}
          className="mt-1 w-full resize-none rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] px-2 py-1.5 text-[11px] font-normal placeholder:text-[color:var(--color-fg-muted)] focus:outline-none"
        />
      </label>
      <label className="flex items-start gap-2 text-[11px]">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
        {t('confirm')}
      </label>
      <button
        type="submit"
        disabled={!ready}
        className="rounded-md bg-[color:var(--color-fg)] px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--color-bg)] disabled:opacity-60"
      >
        {busy ? t('preparing') : t('submit')}
      </button>
      {!sessions.length && <p className="text-[11px] muted">{t('noSessions')}</p>}
      {error && <p className="text-[11px] text-alert">{error}</p>}
    </form>
  );
}

function Evidence({
  odoo,
  cards,
  cardText,
  tNav,
}: {
  odoo: OdooApi;
  cards: CompanionCard[];
  cardText: (card: CompanionCard, part: 'title' | 'finding') => string;
  tNav: T;
}) {
  const t = useTranslations('companion');
  const ctx = odoo.context;
  return (
    <div className="space-y-6">
      <section>
        <p className="eyebrow text-[9px]">{t('evidence.odoo')}</p>
        {ctx ? (
          <dl className="mt-2 space-y-2">
            {ctx.intel.map((i) => (
              <div key={i.label}>
                <dt className="text-[10px] muted">{i.label}</dt>
                <dd className="text-[12px]">{i.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-[12px] muted">{t(`status.${odoo.status}`)}</p>
        )}
      </section>

      {ctx && ctx.roster.length > 0 && (
        <section>
          <p className="eyebrow text-[9px]">{t('evidence.roster')}</p>
          <ul className="mt-2">
            {ctx.roster.map((r) => (
              <li key={r.memberId} className="flex justify-between border-b border-[color:var(--color-border)] py-2 text-[12px]">
                <Link href={`/dashboard/contacts/${r.memberId}`} className="hover:underline">
                  {r.displayName}
                </Link>
                <span className="muted">{r.attendanceState === 'pending' ? t('evidence.pending') : r.attendanceState}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ctx && ctx.roster.length === 0 && (
        <section>
          <p className="eyebrow text-[9px]">{t('evidence.sessions')}</p>
          {ctx.sessions.length ? (
            <ul className="mt-2">
              {ctx.sessions.map((s) => (
                <li key={s.sessionId} className="flex justify-between gap-2 border-b border-[color:var(--color-border)] py-2 text-[12px]">
                  <Link href={`/dashboard/instructor?session=${s.sessionId}`} className="truncate hover:underline">
                    {s.title}
                  </Link>
                  <span className="shrink-0 muted">{new Date(s.startsAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] muted">{t('followUp.noSessions')}</p>
          )}
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <p className="eyebrow text-[9px]">{t('evidence.rules')}</p>
          <ul className="mt-2 space-y-3">
            {cards.map((card) => (
              <li key={card.id} className="text-[12px]">
                <p className="font-semibold">{cardText(card, 'title')}</p>
                <p className="mt-0.5 muted">{cardText(card, 'finding')}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {card.records.map((r) => (
                    <Link key={r.href + r.label} href={r.href} className="rounded bg-inset px-1.5 py-0.5 text-[11px] hover:underline">
                      {r.label ?? tNav(r.navKey ?? 'today')}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function History({ odoo }: { odoo: OdooApi }) {
  const t = useTranslations('companion.history');
  const followUps = odoo.context?.followUps ?? [];
  const time = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

  if (!odoo.receipts.length && !followUps.length) return <p className="text-[12px] muted">{t('empty')}</p>;
  return (
    <div className="space-y-6">
      {odoo.receipts.length > 0 && (
        <section>
          <p className="eyebrow text-[9px]">{t('receipts')}</p>
          <ul className="mt-2">
            {odoo.receipts.map((r) => (
              <li key={`${r.suggestionId}:${r.id}`} className="border-b border-[color:var(--color-border)] py-2 text-[12px]">
                <p>{r.summary}</p>
                <p className="mt-0.5 text-[10px] muted">
                  {r.actor} · {time(r.at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {followUps.length > 0 && (
        <section>
          <p className="eyebrow text-[9px]">{t('followUps')}</p>
          <ul className="mt-2 space-y-3">
            {followUps.map((f) => (
              <li key={f.id} className="rounded-lg border border-[color:var(--color-border)] p-3 text-[12px]">
                <p className="font-semibold">{f.memberName}</p>
                <p className="mt-1">{f.summary}</p>
                <p className="mt-2 text-[10px] muted">{t('reply')}</p>
                <p className="whitespace-pre-wrap">{f.replyDraft}</p>
                <p className="mt-2 text-[10px] muted">
                  {f.status} · {f.mode} · {time(f.at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
