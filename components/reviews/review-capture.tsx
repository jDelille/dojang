'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Customer-facing review capture (a "review gate", used honestly).
 *
 * 4–5 stars: thank them and offer the public review link.
 * 1–3 stars: keep it private and route the complaint straight to the owner,
 * which is the whole point of asking before they post publicly.
 */
export function ReviewCapture({
  slug,
  businessName,
  logoUrl,
  contactEmail,
  contactPhone,
}: {
  slug: string;
  businessName: string;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}) {
  const t = useTranslations('reviewCapture');
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState<'rating' | 'form' | 'done' | 'sending'>('rating');
  const [error, setError] = useState('');

  const positive = rating >= 4;

  const submit = async () => {
    setState('sending');
    setError('');
    try {
      const res = await fetch('/api/reviews/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceSlug: slug, rating, authorName: name, body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Could not send your feedback. Please try again.');
        setState('form');
        return;
      }
      setState('done');
    } catch {
      setError('Could not reach the server. Please try again.');
      setState('form');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-paper)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={businessName} className="mx-auto h-10 w-auto object-contain" />
          ) : (
            <h1 className="font-display text-xl font-semibold tracking-tight">{businessName}</h1>
          )}
        </div>

        <div className="rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-8">
          {state === 'done' ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-success" strokeWidth={1.5} />
              <h2 className="mt-4 font-display text-lg font-semibold">
                {positive ? 'Thank you!' : 'Thank you for telling us'}
              </h2>
              <p className="mt-2 text-sm muted">
                {positive
                  ? 'We really appreciate you taking the time.'
                  : 'Your feedback goes straight to the owner, and someone will be in touch.'}
              </p>

              {positive && (
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(businessName)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-6 inline-flex items-center justify-center rounded-control bg-accent px-5 py-2.5 text-sm font-medium text-[color:var(--color-accent-fg)] transition-colors hover:bg-accent-dark"
                >{t('shareItOnGoogle')}</a>
              )}
            </div>
          ) : (
            <>
              <h2 className="text-center font-display text-lg font-semibold">{t('howDidWeDo')}</h2>
              <p className="mt-1 text-center text-sm muted">{t('itTakesAboutTenSeconds')}</p>

              <fieldset className="mt-6">
                <legend className="sr-only">{t('yourRatingOutOfFive')}</legend>
                <div
                  className="flex items-center justify-center gap-1.5"
                  onMouseLeave={() => setHover(0)}
                >
                  {[1, 2, 3, 4, 5].map((n) => {
                    const active = (hover || rating) >= n;
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                        aria-pressed={rating === n}
                        onMouseEnter={() => setHover(n)}
                        onClick={() => {
                          setRating(n);
                          setState('form');
                        }}
                        className="rounded-control p-1 transition-transform duration-150 hover:scale-110"
                      >
                        <Star
                          className={cn('h-9 w-9', active ? 'text-warning' : 'muted')}
                          strokeWidth={1.5}
                          fill={active ? 'currentColor' : 'none'}
                        />
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {state !== 'rating' && (
                <div className="mt-6 space-y-4 border-t border-[color:var(--color-border)] pt-6">
                  {!positive && (
                    <p className="rounded-control border border-[color:var(--color-border)] bg-[color:var(--color-paper)] p-3 text-xs muted">
                      Sorry we missed the mark. Tell us what went wrong — this goes privately to
                      the owner, not onto a public page.
                    </p>
                  )}

                  <div>
                    <label htmlFor="rc-name" className="mb-1.5 block text-xs font-medium">{t('yourName')}</label>
                    <input
                      id="rc-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-9 w-full rounded-control border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label htmlFor="rc-body" className="mb-1.5 block text-xs font-medium">
                      {positive ? 'Anything you would like to add?' : 'What went wrong?'}
                    </label>
                    <textarea
                      id="rc-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={4}
                      className="w-full resize-y rounded-control border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm leading-relaxed focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  {error && <p className="text-xs text-alert">{error}</p>}

                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={state === 'sending'}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-control bg-accent text-sm font-medium text-[color:var(--color-accent-fg)] transition-colors hover:bg-accent-dark disabled:opacity-50"
                  >
                    {state === 'sending' && (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                    )}
                    Send feedback
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {(contactEmail || contactPhone) && (
          <p className="mt-6 text-center text-xs muted">
            Need something else? Reach {businessName} at{' '}
            {contactPhone && (
              <a href={`tel:${contactPhone}`} className="underline underline-offset-4">
                {contactPhone}
              </a>
            )}
            {contactPhone && contactEmail && ' or '}
            {contactEmail && (
              <a href={`mailto:${contactEmail}`} className="underline underline-offset-4">
                {contactEmail}
              </a>
            )}
            .
          </p>
        )}
      </div>
    </div>
  );
}
