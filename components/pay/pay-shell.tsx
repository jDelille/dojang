import type { ReactNode } from 'react';
import { brandStyle } from '@/lib/brand';

/**
 * Shared chrome for the two payment-result pages.
 *
 * These are the last screens a paying customer sees, and they are the only
 * part of Roster most customers ever meet — so they carry the seller's
 * branding, not ours.
 */
export function PayShell({
  accentColor,
  logoUrl,
  businessName,
  icon,
  title,
  children,
}: {
  accentColor?: string | null;
  logoUrl?: string | null;
  businessName?: string | null;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const accentCss = brandStyle(accentColor);

  return (
    <>
      {accentCss && <style dangerouslySetInnerHTML={{ __html: accentCss }} />}
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-paper)] px-4 py-12">
        <div className="w-full max-w-sm rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-8 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary seller-hosted URL
            <img
              src={logoUrl}
              alt={businessName ?? ''}
              className="mx-auto mb-5 h-8 w-auto object-contain"
            />
          ) : businessName ? (
            <p className="mb-5 font-display text-sm font-semibold">{businessName}</p>
          ) : null}

          <div className="flex justify-center">{icon}</div>
          <h1 className="mt-4 font-display text-lg font-semibold">{title}</h1>
          {children}
        </div>
      </div>
    </>
  );
}
