'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronDown, LogOut, Moon, Plus, Settings, Sparkles, Sun, X } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { useTheme } from '@/components/providers';
import { ROLE_LABELS } from '@/lib/rbac';
import type { Role } from '@prisma/client';
import {
  SECTIONS,
  TODAY_HREF,
  pageMatches,
  sectionFor,
  sectionHref,
  visiblePages,
  type NavSection,
} from './nav';
import { CommandPalette } from './command-palette';
import { CompanionPanel } from '@/components/companion/companion-panel';

/**
 * Front-desk chrome, laid out 1:1 with the design outline:
 *
 *   rail (sections) │ context column │ top bar / tabs / page │ Companion
 *
 * The whole app sits in one rounded frame on a darker canvas; each column
 * scrolls on its own so the rail, arrivals and agent never scroll away.
 */

export type ShellUser = {
  name: string | null;
  email: string;
  role: Role;
};

export type ShellWorkspace = {
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
  timezone: string;
};

export type ShellArrival = {
  id: string;
  title: string;
  startsAt: string;
  status: string;
  contactId: string;
  contactName: string;
};

export type ShellDesk = {
  timezone: string;
  arrivals: ShellArrival[];
  agent: { id: string; name: string; queue: number } | null;
  tasksDue: { id: string; title: string; dueAt: string | null; contactId: string | null }[];
  evidence: { id: string; title: string; type: string; createdAt: string; contactId: string | null }[];
};

type ShellApi = {
  openPalette: () => void;
  /** Opens the Companion and sends `prompt` to the agent. */
  askAgent: (prompt: string) => void;
};

const ShellContext = createContext<ShellApi>({ openPalette: () => {}, askAgent: () => {} });

export function useShell() {
  return useContext(ShellContext);
}

const PANEL_KEY = 'roster-agent-panel';

export function DashboardShell({
  user,
  workspace,
  desk,
  showSuperAdmin,
  children,
}: {
  user: ShellUser;
  workspace: ShellWorkspace;
  desk: ShellDesk;
  showSuperAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const section = sectionFor(pathname);

  const [paletteOpen, setPaletteOpen] = useState(false);
  // null until mounted: the panel then shows only on wide screens (CSS), so a
  // desktop reload does not jump and a phone does not open covered.
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<{ text: string; at: number } | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(PANEL_KEY);
    } catch {
      // Storage blocked — fall back to the screen-size default.
    }
    setPanelOpen(stored ? stored === 'open' : window.matchMedia('(min-width: 1280px)').matches);
  }, []);

  const setPanel = useCallback((open: boolean) => {
    setPanelOpen(open);
    try {
      localStorage.setItem(PANEL_KEY, open ? 'open' : 'closed');
    } catch {
      // Private browsing — the choice holds for this page only.
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const api = useMemo<ShellApi>(
    () => ({
      openPalette: () => setPaletteOpen(true),
      askAgent: (text: string) => {
        setPanel(true);
        setPendingPrompt({ text, at: Date.now() });
      },
    }),
    [setPanel],
  );

  return (
    <ShellContext.Provider value={api}>
      <div className="h-dvh">
        <div className="flex h-full overflow-hidden bg-[color:var(--color-bg)]">
          <Rail
            user={user}
            workspace={workspace}
            active={section}
            showSuperAdmin={showSuperAdmin}
          />

          <ContextColumn
            section={section}
            desk={desk}
            showSuperAdmin={showSuperAdmin}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar
              workspace={workspace}
              onSearch={() => setPaletteOpen(true)}
              panelOpen={panelOpen}
              onOpenPanel={() => setPanel(true)}
            />
            <PageTabs />
            <SectionStrip section={section} showSuperAdmin={showSuperAdmin} />
            <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-24 pt-6 scrollbar-thin sm:px-6 sm:pb-8">
              {children}
            </main>
          </div>

          <CompanionPanel
            open={panelOpen}
            onClose={() => setPanel(false)}
            desk={desk}
            user={user}
            pendingPrompt={pendingPrompt}
          />
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        showSuperAdmin={showSuperAdmin}
        onAsk={(text) => {
          setPaletteOpen(false);
          api.askAgent(text);
        }}
      />
    </ShellContext.Provider>
  );
}

/* ── Rail ──────────────────────────────────────────────────────────────────── */

function Rail({
  user,
  workspace,
  active,
  showSuperAdmin,
}: {
  user: ShellUser;
  workspace: ShellWorkspace;
  active: NavSection;
  showSuperAdmin: boolean;
}) {
  const t = useTranslations('nav');
  const sections = SECTIONS.filter(
    (s) => s.id === 'today' || visiblePages(s, showSuperAdmin).length > 0,
  );

  return (
    <>
      {/* Desktop / tablet: vertical rail */}
      <aside className="hidden w-[72px] shrink-0 flex-col items-center border-e border-[color:var(--color-border)] bg-panel py-4 sm:flex">
        <Link
          href={TODAY_HREF}
          title={workspace.name}
          className="mb-5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] text-sm font-semibold"
        >
          {workspace.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={workspace.logoUrl} alt={workspace.name} className="h-full w-full object-contain" />
          ) : (
            workspace.name.trim().charAt(0).toUpperCase() || 'R'
          )}
        </Link>

        <nav aria-label={t('overview')} className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto scrollbar-thin">
          {sections.map((s) => {
            const isActive = s.id === active.id;
            return (
              <Link
                key={s.id}
                href={sectionHref(s)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex w-[54px] flex-col items-center rounded-lg border-s-2 py-2 transition-colors duration-150',
                  isActive
                    ? 'border-nav bg-inset text-nav'
                    : 'border-transparent muted hover:bg-inset/60 hover:text-[color:var(--color-fg)]',
                )}
              >
                <span className="text-[13px] font-medium tracking-wide">{s.abbr}</span>
                <span className="mt-0.5 text-[10px] leading-3">{t(s.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <AccountMenu user={user} />
      </aside>

      {/* Phone: the same sections as a bottom bar */}
      <nav
        aria-label={t('overview')}
        className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-[color:var(--color-border)] bg-panel/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur scrollbar-thin sm:hidden"
      >
        {sections.map((s) => {
          const isActive = s.id === active.id;
          return (
            <Link
              key={s.id}
              href={sectionHref(s)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-w-[56px] flex-1 flex-col items-center py-2',
                isActive ? 'text-nav' : 'muted',
              )}
            >
              <span className="text-[12px] font-medium">{s.abbr}</span>
              <span className="text-[10px] leading-3">{t(s.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function AccountMenu({ user }: { user: ShellUser }) {
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div ref={ref} className="relative mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t('account')}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-inset text-[11px] font-semibold text-nav"
      >
        {initials(user.name || user.email)}
      </button>

      {open && (
        <div className="absolute bottom-0 start-full z-40 ms-3 w-60 animate-fade-in rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-1.5 shadow-popover">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{user.name || user.email}</p>
            <p className="truncate text-xs muted">{ROLE_LABELS[user.role]}</p>
          </div>
          <div className="my-1 border-t border-[color:var(--color-border)]" />
          <button onClick={toggle} className={MENU_ITEM}>
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Moon className="h-4 w-4" strokeWidth={1.75} />
            )}
            {theme === 'dark' ? t('lightMode') : t('darkMode')}
          </button>
          <Link href="/dashboard/settings" onClick={() => setOpen(false)} className={MENU_ITEM}>
            <Settings className="h-4 w-4" strokeWidth={1.75} />
            {tNav('settings')}
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className={cn(MENU_ITEM, 'hover:text-alert')}
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            {tNav('signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

const MENU_ITEM =
  'flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-start text-sm muted transition-colors hover:bg-inset hover:text-[color:var(--color-fg)]';

/* ── Context column ────────────────────────────────────────────────────────── */

function ContextColumn({
  section,
  desk,
  showSuperAdmin,
}: {
  section: NavSection;
  desk: ShellDesk;
  showSuperAdmin: boolean;
}) {
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  const pathname = usePathname();

  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-e border-[color:var(--color-border)] bg-panel lg:flex">
      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-5 scrollbar-thin">
        {section.id === 'today' ? (
          <Arrivals desk={desk} />
        ) : (
          <>
            <h2 className="mb-4 px-1 text-[17px] font-semibold">{tNav(section.labelKey)}</h2>
            <ul className="space-y-1.5">
              {visiblePages(section, showSuperAdmin).map((page) => {
                const active = pageMatches(page, pathname);
                return (
                  <li key={page.href}>
                    <Link
                      href={page.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(CONTEXT_ROW, active && CONTEXT_ROW_ACTIVE)}
                    >
                      <page.icon className="h-4 w-4 shrink-0 muted" strokeWidth={1.75} />
                      <span className="text-[13px] font-medium">{tNav(page.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <p className="eyebrow mb-2 mt-6 px-1">{t('agentSection')}</p>
        {desk.agent ? (
          <Link href="/dashboard/inbox" className="flex items-start gap-2.5 rounded-lg px-1 py-1">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-live" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{desk.agent.name}</span>
              <span className="block text-[11px] muted">
                {t('agentOnline', { count: desk.agent.queue })}
              </span>
            </span>
          </Link>
        ) : (
          <Link href="/dashboard/agents" className="flex items-start gap-2.5 rounded-lg px-1 py-1">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">{t('agentOff')}</span>
              <span className="block text-[11px] muted">{t('setUpAgent')}</span>
            </span>
          </Link>
        )}
      </div>
    </aside>
  );
}

const CONTEXT_ROW =
  'flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:bg-inset/50';
const CONTEXT_ROW_ACTIVE = 'border-[color:var(--color-border)] bg-[color:var(--color-elevated)]';

function Arrivals({ desk }: { desk: ShellDesk }) {
  const t = useTranslations('shell');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [query, setQuery] = useState('');

  const selectedBooking = pathname === TODAY_HREF ? searchParams.get('booking') : null;
  const q = query.trim().toLowerCase();
  const arrivals = q
    ? desk.arrivals.filter(
        (a) => a.title.toLowerCase().includes(q) || a.contactName.toLowerCase().includes(q),
      )
    : desk.arrivals;

  return (
    <>
      <h2 className="mb-4 px-1 text-[17px] font-semibold">{t('arrivingSoon')}</h2>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('searchArrivals')}
        aria-label={t('searchArrivals')}
        className="mb-4 h-10 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] px-3 text-[13px] placeholder:text-[color:var(--color-fg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />

      {arrivals.length ? (
        <ul className="space-y-1">
          {arrivals.map((a) => {
            const { time, day } = clock(a.startsAt, desk.timezone);
            return (
              <li key={a.id}>
                <Link
                  href={`${TODAY_HREF}?member=${a.contactId}&booking=${a.id}`}
                  className={cn(
                    'flex gap-3 rounded-lg border border-transparent px-2.5 py-2.5 transition-colors hover:bg-inset/50',
                    selectedBooking === a.id && CONTEXT_ROW_ACTIVE,
                  )}
                >
                  <span className="w-10 shrink-0">
                    <span className="block text-[13px] font-semibold tabular-nums">{time}</span>
                    {day && <span className="block text-[10px] uppercase muted">{day}</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium leading-snug">{a.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] muted">
                      {a.contactName} · {a.status}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-1 text-[12px] muted">{t('noArrivals')}</p>
      )}
    </>
  );
}

/** "4:15" plus a weekday when the booking is not today, in the workspace zone. */
function clock(iso: string, timeZone: string) {
  const date = new Date(iso);
  const opts = { timeZone } as const;
  let time: string;
  let day: string | null = null;
  try {
    time = new Intl.DateTimeFormat('en-US', { ...opts, hour: 'numeric', minute: '2-digit', hour12: true })
      .formatToParts(date)
      .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal')
      .map((p) => p.value)
      .join('')
      .trim();
    const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { ...opts }).format(d);
    if (ymd(date) !== ymd(new Date())) {
      day = new Intl.DateTimeFormat(undefined, { ...opts, weekday: 'short' }).format(date);
    }
  } catch {
    time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return { time, day };
}

/* ── Top bar ───────────────────────────────────────────────────────────────── */

// Members, classes, leads and invoices are created in Odoo; Roster pages
// for them are read-only, so only Roster's own records are offered here.
const CREATE_LINKS = [{ href: '/dashboard/tasks', key: 'newTask' }] as const;

function TopBar({
  workspace,
  onSearch,
  panelOpen,
  onOpenPanel,
}: {
  workspace: ShellWorkspace;
  onSearch: () => void;
  panelOpen: boolean | null;
  onOpenPanel: () => void;
}) {
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  const [menu, setMenu] = useState<'workspace' | 'create' | null>(null);
  const wsRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  useDismiss(wsRef, menu === 'workspace', () => setMenu(null));
  useDismiss(createRef, menu === 'create', () => setMenu(null));

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[color:var(--color-border)] px-3 sm:px-5">
      <div ref={wsRef} className="relative">
        <button
          onClick={() => setMenu(menu === 'workspace' ? null : 'workspace')}
          aria-expanded={menu === 'workspace'}
          aria-label={t('switchWorkspace')}
          className="flex max-w-[160px] items-center gap-1 text-[13px] font-semibold"
        >
          <span className="truncate">{workspace.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 muted" strokeWidth={2} />
        </button>
        {menu === 'workspace' && (
          <div className="absolute start-0 top-full z-40 mt-2 w-56 animate-fade-in rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-1.5 shadow-popover">
            <p className="eyebrow px-2.5 py-1.5">{t('workspace')}</p>
            <p className="truncate px-2.5 pb-2 text-sm font-medium">{workspace.name}</p>
            <Link href="/dashboard/settings" onClick={() => setMenu(null)} className={MENU_ITEM}>
              <Settings className="h-4 w-4" strokeWidth={1.75} />
              {tNav('settings')}
            </Link>
          </div>
        )}
      </div>

      <button
        onClick={onSearch}
        className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] px-3 text-start text-[13px] font-medium muted transition-colors hover:text-[color:var(--color-fg)]"
      >
        <span className="truncate">{t('searchPlaceholder')}</span>
      </button>
      <kbd className="hidden rounded-md border border-[color:var(--color-border)] bg-inset px-1.5 py-0.5 text-[10px] muted md:inline">
        ⌘K
      </kbd>

      <div ref={createRef} className="relative">
        <button
          onClick={() => setMenu(menu === 'create' ? null : 'create')}
          aria-label={t('create')}
          aria-expanded={menu === 'create'}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] transition-colors hover:bg-inset"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
        {menu === 'create' && (
          <div className="absolute end-0 top-full z-40 mt-2 w-52 animate-fade-in rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-1.5 shadow-popover">
            <p className="eyebrow px-2.5 py-1.5">{t('create')}</p>
            {CREATE_LINKS.map((item) => (
              <Link key={item.key} href={item.href} onClick={() => setMenu(null)} className={MENU_ITEM}>
                {t(item.key)}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Reopen Do For Me once closed; hidden while the panel is showing. */}
      <button
        onClick={onOpenPanel}
        aria-label={t('openDoForMe')}
        title={t('doForMe')}
        className={cn(
          'h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] text-agent transition-colors hover:bg-inset',
          panelOpen === null ? 'flex xl:hidden' : panelOpen ? 'hidden' : 'flex',
        )}
      >
        <Sparkles className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </header>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────────────────── */

type Tab = { href: string; label: string };
const TABS_KEY = 'roster-tabs';
const MAX_TABS = 6;

/**
 * "Today" is pinned; every other page opened becomes a closable tab, labelled
 * from its <title> (pages set it via metadata, e.g. a contact's name).
 */
function PageTabs() {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState<Tab[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(TABS_KEY) ?? '[]');
      if (Array.isArray(saved)) setTabs(saved.filter((x) => x && typeof x.href === 'string'));
    } catch {
      // Corrupt or blocked storage — start with Today only.
    }
  }, []);

  const save = (next: Tab[]) => {
    setTabs(next);
    try {
      sessionStorage.setItem(TABS_KEY, JSON.stringify(next));
    } catch {
      // Tabs still work for this page.
    }
  };

  // Open (or relabel) a tab for the current page once its title has settled.
  useEffect(() => {
    if (pathname === TODAY_HREF) return;
    const label = () => document.title.split(' · ')[0]?.trim() || pathname;
    const upsert = () =>
      setTabs((current) => {
        const existing = current.find((tab) => tab.href === pathname);
        const next = existing
          ? current.map((tab) => (tab.href === pathname ? { ...tab, label: label() } : tab))
          : [...current, { href: pathname, label: label() }].slice(-MAX_TABS);
        try {
          sessionStorage.setItem(TABS_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    const timer = window.setTimeout(upsert, 60);
    const titleEl = document.querySelector('title');
    const observer = titleEl ? new MutationObserver(upsert) : null;
    if (titleEl) observer?.observe(titleEl, { childList: true });
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [pathname]);

  const close = (href: string) => {
    const index = tabs.findIndex((tab) => tab.href === href);
    const next = tabs.filter((tab) => tab.href !== href);
    save(next);
    if (href === pathname) router.push(next[Math.max(0, index - 1)]?.href ?? TODAY_HREF);
  };

  return (
    <div className="flex h-[46px] shrink-0 items-end gap-1 overflow-x-auto border-b border-[color:var(--color-border)] px-3 scrollbar-thin sm:px-5">
      <TabLink href={TODAY_HREF} label={t('today')} active={pathname === TODAY_HREF} />
      {tabs.map((tab) => (
        <TabLink
          key={tab.href}
          href={tab.href}
          label={tab.label}
          active={tab.href === pathname}
          onClose={() => close(tab.href)}
          closeLabel={t('closeTab', { label: tab.label })}
        />
      ))}
    </div>
  );
}

function TabLink({
  href,
  label,
  active,
  onClose,
  closeLabel,
}: {
  href: string;
  label: string;
  active: boolean;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div
      className={cn(
        'mb-1.5 flex h-8 shrink-0 items-center rounded-md border text-[12px] font-medium',
        active
          ? 'border-[color:var(--color-border)] bg-[color:var(--color-elevated)]'
          : 'border-transparent muted hover:text-[color:var(--color-fg)]',
      )}
    >
      <Link href={href} aria-current={active ? 'page' : undefined} className="max-w-[180px] truncate px-3">
        {label}
      </Link>
      {onClose && (
        <button
          onClick={onClose}
          aria-label={closeLabel}
          className="me-1.5 rounded p-0.5 muted hover:text-[color:var(--color-fg)]"
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

/* Below lg the context column is hidden, so the section's pages show here. */
function SectionStrip({ section, showSuperAdmin }: { section: NavSection; showSuperAdmin: boolean }) {
  const tNav = useTranslations('nav');
  const pathname = usePathname();
  const pages = visiblePages(section, showSuperAdmin);
  if (pages.length < 2) return null;

  return (
    <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[color:var(--color-border)] px-3 py-2 scrollbar-thin sm:px-5 lg:hidden">
      {pages.map((page) => {
        const active = pageMatches(page, pathname);
        return (
          <Link
            key={page.href}
            href={page.href}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium',
              active
                ? 'border-[color:var(--color-border)] bg-[color:var(--color-elevated)]'
                : 'border-transparent muted',
            )}
          >
            {tNav(page.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/** Close a popover on outside click or Escape. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, active: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!active) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, active, onDismiss]);
}
