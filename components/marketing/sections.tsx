import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

/**
 * Marketing building blocks.
 *
 * Server components with no client JavaScript — the landing page is the first
 * thing a buyer loads and often the only page they judge the product on.
 * Interaction is whatever CSS can do alone (`<details>` for the FAQ).
 *
 * The visual language is deliberately *not* the centerd-hero-and-gradient
 * pattern: full-bleed bands that alternate ink and paper, an asymmetric bento
 * hero, big numerals as furniture, and amber only ever as a hairline marker —
 * which is what the Ledger system asks for and what a radial glow contradicts.
 */

export function Container({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={`mx-auto w-full max-w-6xl px-6 ${className}`}>
      {children}
    </div>
  );
}

/** Full-bleed band. `ink` inverts the whole section. */
export function Band({
  tone = 'paper',
  children,
  className = '',
  id,
}: {
  tone?: 'paper' | 'ink' | 'surface';
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const tones = {
    paper: 'bg-[color:var(--color-paper)]',
    surface: 'bg-[color:var(--color-surface)] border-y border-[color:var(--color-border)]',
    // Fixed ink, not a token: this band must stay dark in both themes, or the
    // alternating rhythm the whole page is built on collapses in dark mode.
    ink: 'bg-[#0F1115] text-[#F2F2EF]',
  } as const;
  return (
    <section id={id} className={`${tones[tone]} ${className}`}>
      {children}
    </section>
  );
}

/** Monospace section marker — 01 / FEATURES. */
export function Marker({ n, label, onInk = false }: { n: string; label: string; onInk?: boolean }) {
  return (
    <p className={`flex items-center gap-3 font-mono text-2xs uppercase tracking-[0.18em] ${onInk ? 'text-[#98A1B0]' : 'muted'}`}>
      <span className="text-accent">{n}</span>
      <span className={`h-px w-8 ${onInk ? 'bg-white/20' : 'bg-[color:var(--color-border)]'}`} />
      {label}
    </p>
  );
}

/** Display heading with an optional serif-italic accent clause. */
export function Headline({
  children,
  accent,
  className = '',
}: {
  children: ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    // text-[color:inherit] on purpose: globals.css pins every heading to
    // --color-fg, which renders black-on-black inside an ink band.
    <h2
      className={`font-display text-3xl font-bold leading-[1.08] tracking-tight text-[color:inherit] sm:text-4xl ${className}`}
    >
      {children}
      {accent && (
        <>
          {' '}
          <span className="font-serif text-[1.12em] font-normal italic tracking-normal">{accent}</span>
        </>
      )}
    </h2>
  );
}

/**
 * A CSS-drawn dashboard, not a screenshot.
 *
 * Screenshots of a self-hosted product go stale the moment the UI changes and
 * bloat the ZIP; this renders from the same tokens, so it always matches the
 * current build and costs nothing to ship.
 */
export function PreviewTile() {
  return (
    <div className="overflow-hidden rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)]">
      <div className="flex items-center gap-1.5 border-b border-[color:var(--color-border)] px-3 py-2">
        <span className="h-2 w-2 rounded-pill bg-[color:var(--color-border)]" />
        <span className="h-2 w-2 rounded-pill bg-[color:var(--color-border)]" />
        <span className="ms-2 font-mono text-[10px] muted">inbox</span>
      </div>
      <div className="space-y-2 p-3">
        {[
          ['Northside Dental', 'Can you do Tuesday at 2?', true],
          ['Westlake Partners', 'What does a callout cost?', false],
          ['Hill Country', 'Thanks — see you then.', false],
        ].map(([who, msg, unread]) => (
          <div key={who as string} className="flex items-start gap-2">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill ${unread ? 'bg-accent' : 'bg-[color:var(--color-border)]'}`} />
            <div className="min-w-0">
              <p className="truncate text-2xs font-medium">{who}</p>
              <p className="truncate text-[10px] muted">{msg}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Big-numeral tile. The number is the design element. */
export function StatTile({
  value,
  label,
  tone = 'paper',
}: {
  value: string;
  label: string;
  tone?: 'paper' | 'ink' | 'accent';
}) {
  const tones = {
    paper: 'bg-[color:var(--color-elevated)] border border-[color:var(--color-border)]',
    ink: 'bg-[#0F1115] text-[#F2F2EF]',
    accent: 'bg-accent text-[color:var(--color-accent-fg)]',
  } as const;
  return (
    <div className={`flex flex-col justify-between rounded-card p-5 ${tones[tone]}`}>
      <p className="font-display text-3xl font-bold leading-none tracking-tight tabular-nums sm:text-4xl">
        {value}
      </p>
      <p className={`mt-3 text-2xs leading-snug ${tone === 'paper' ? 'muted' : 'opacity-70'}`}>{label}</p>
    </div>
  );
}

/** Sparkline tile — pure CSS bars, no chart library on the marketing page. */
export function ChartTile({ label, bars }: { label: string; bars: number[] }) {
  return (
    <div className="flex flex-col justify-between rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-5">
      <p className="text-2xs muted">{label}</p>
      <div className="mt-4 flex h-16 items-end gap-1.5">
        {bars.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-[3px] ${i === bars.length - 1 ? 'bg-accent' : 'bg-[color:var(--color-border)]'}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Feature card with the corner arrow from the reference layouts. */
export function FeatureCard({
  title,
  body,
  tone = 'paper',
}: {
  title: string;
  body: string;
  tone?: 'paper' | 'accent';
}) {
  return (
    <div
      className={`group relative flex min-h-[190px] flex-col justify-between rounded-card p-5 transition-colors duration-200 ease-out ${
        tone === 'accent'
          ? 'bg-accent/12 border border-accent/30'
          : 'border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] hover:border-[color:var(--color-fg-muted)]'
      }`}
    >
      <div>
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        <p className="mt-2 text-xs leading-relaxed muted">{body}</p>
      </div>
      <span
        aria-hidden
        className="mt-4 flex h-7 w-7 items-center justify-center self-start rounded-pill border border-[color:var(--color-border)] transition-colors duration-200 ease-out group-hover:border-accent group-hover:bg-accent group-hover:text-[color:var(--color-accent-fg)]"
      >
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
    </div>
  );
}

export function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-[color:var(--color-border)] py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {q}
        <span
          aria-hidden
          className="relative h-3 w-3 shrink-0 transition-transform duration-200 ease-out group-open:rotate-45"
        >
          <span className="absolute start-0 top-1/2 h-px w-3 -translate-y-1/2 bg-[color:var(--color-fg-muted)]" />
          <span className="absolute start-1/2 top-0 h-3 w-px -translate-x-1/2 bg-[color:var(--color-fg-muted)]" />
        </span>
      </summary>
      <p className="mt-3 max-w-prose text-xs leading-relaxed muted">{a}</p>
    </details>
  );
}
