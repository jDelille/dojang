import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ShieldAlert } from 'lucide-react';
import { requireWorkspace } from '@/lib/session';
import { checkLicense } from '@/lib/license-gate';
import { getLicenseStatus } from '@/lib/integrations/envato';
import { LicenseForm } from '@/components/license/license-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'License required' };

/**
 * Deliberately outside the (dashboard) route group.
 *
 * The gate lives in the dashboard layout, so a license page inside it would
 * be caught by its own check and redirect forever. Sitting outside keeps the
 * one route a locked-out buyer needs permanently reachable.
 */
export default async function LicensePage() {
  const t = await getTranslations('license');
  const { workspaceId, workspace } = await requireWorkspace();
  const verdict = await checkLicense(workspaceId);

  if (verdict.allowed && verdict.reason !== 'grace') redirect('/dashboard');
  const status = await getLicenseStatus(workspaceId);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-paper)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-sm font-bold text-[color:var(--color-accent-fg)]">
            R
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">{t('roster')}</span>
        </div>

        <div className="rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" strokeWidth={1.75} />
            <div className="min-w-0">
              <h1 className="font-display text-base font-semibold">
                {verdict.allowed ? 'License this copy of Roster' : 'A purchase code is required'}
              </h1>
              <p className="mt-1 text-sm muted">
                {verdict.allowed
                  ? 'Roster is running on a trial period. Enter your Envato purchase code to keep it unlocked.'
                  : verdict.message}
              </p>
            </div>
          </div>

          <dl className="mt-5 space-y-1.5 rounded-control border border-[color:var(--color-border)] px-4 py-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="muted">{t('workspace')}</dt>
              <dd className="font-medium">{workspace.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="muted">{t('thisDomain')}</dt>
              <dd className="font-mono">{status.domain}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="muted">{t('status')}</dt>
              <dd className="font-medium">{status.status}</dd>
            </div>
            {verdict.allowed && verdict.reason === 'grace' && verdict.graceEndsAt && (
              <div className="flex justify-between gap-3">
                <dt className="muted">{t('trialEnds')}</dt>
                <dd className="font-medium">
                  {verdict.graceEndsAt.toLocaleDateString(undefined, {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-5">
            <LicenseForm allowSkip={verdict.allowed} />
          </div>

          <p className="mt-5 border-t border-[color:var(--color-border)] pt-4 text-2xs muted">
            Your purchase code is on your Envato downloads page — open the download menu for Roster
            and choose “License certificate &amp; purchase code”.
          </p>
        </div>
      </div>
    </div>
  );
}
