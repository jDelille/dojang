'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, LayoutDashboard, Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTIONS, TODAY_HREF, visiblePages } from './nav';

type Item = {
  id: string;
  group: 'pages' | 'contacts' | 'ask';
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  run: () => void;
};

/**
 * ⌘K: jump to any page, open a contact as the front-desk context, or hand
 * the query to the agent. Contacts come from /api/contacts?q=.
 */
export function CommandPalette({
  open,
  onClose,
  onAsk,
  showSuperAdmin,
}: {
  open: boolean;
  onClose: () => void;
  onAsk: (text: string) => void;
  showSuperAdmin: boolean;
}) {
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    setContacts([]);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Debounced contact search; stale responses are dropped.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setContacts([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts?q=${encodeURIComponent(q)}&limit=6`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        setContacts(
          (data.contacts ?? []).map((c: { id: string; name: string; company: string | null }) => ({
            id: c.id,
            name: c.name,
            company: c.company,
          })),
        );
      } catch {
        // Aborted or offline — keep the page results.
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    type PageEntry = { id: string; href: string; label: string; hint?: string; icon: Item['icon'] };
    const pages: Item[] = [
      { id: 'today', href: TODAY_HREF, label: tNav('today'), icon: LayoutDashboard } as PageEntry,
      ...SECTIONS.flatMap((section) =>
        visiblePages(section, showSuperAdmin).map((page) => ({
          id: page.href,
          href: page.href,
          label: tNav(page.labelKey),
          hint: tNav(section.labelKey),
          icon: page.icon,
        })),
      ),
    ]
      .filter((page) => !q || page.label.toLowerCase().includes(q) || page.hint?.toLowerCase().includes(q))
      .map(({ href, ...page }) => ({ ...page, group: 'pages' as const, run: () => go(href) }));

    const people: Item[] = contacts.map((c) => ({
      id: `contact-${c.id}`,
      group: 'contacts',
      label: c.name,
      hint: c.company ?? undefined,
      icon: User,
      run: () => go(`${TODAY_HREF}?member=${c.id}`),
    }));

    const ask: Item[] = q
      ? [{ id: 'ask', group: 'ask', label: t('askAi', { query: query.trim() }), icon: Sparkles, run: () => onAsk(query.trim()) }]
      : [];

    return [...people, ...pages.slice(0, q ? 8 : 14), ...ask];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, contacts, showSuperAdmin]);

  useEffect(() => setCursor(0), [query, contacts]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      items[cursor]?.run();
    }
  };

  let lastGroup: Item['group'] | null = null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 animate-scrim-in bg-scrim/60" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('searchPlaceholder')}
        className="relative w-full max-w-xl animate-fade-in overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] shadow-modal"
      >
        <div className="flex items-center gap-3 border-b border-[color:var(--color-border)] px-4">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[cursor] ? `palette-${items[cursor].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-[15px] placeholder:text-[color:var(--color-fg-muted)] focus:outline-none"
          />
          <kbd className="rounded-md border border-[color:var(--color-border)] bg-inset px-1.5 py-0.5 text-[10px] muted">
            esc
          </kbd>
        </div>

        <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2 scrollbar-thin">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm muted">{t('noResults')}</li>}
          {items.map((item, index) => {
            const heading =
              item.group !== lastGroup && item.group !== 'ask'
                ? item.group === 'pages'
                  ? t('pagesGroup')
                  : t('contactsGroup')
                : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {heading && <p className="eyebrow px-3 pb-1 pt-2">{heading}</p>}
                <button
                  id={`palette-${item.id}`}
                  role="option"
                  aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={item.run}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm',
                    index === cursor ? 'bg-inset' : '',
                  )}
                >
                  <item.icon
                    className={cn('h-4 w-4 shrink-0', item.group === 'ask' ? 'text-agent' : 'muted')}
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="truncate text-xs muted">{item.hint}</span>}
                  {index === cursor && <CornerDownLeft className="h-3.5 w-3.5 muted" strokeWidth={1.75} />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
