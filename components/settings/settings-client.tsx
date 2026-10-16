'use client';
import { PushToggle } from '@/components/push/push-toggle';
import { LanguagePicker } from '@/components/settings/language-picker';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { PageHeader, Tabs, useToast } from '@/components/ui';
import { CryptoWallets } from '@/components/settings/crypto-wallets';
import { EmailTemplates } from '@/components/settings/email-templates';
import { WorkspaceForm } from '@/components/settings/workspace-form';
import { HoursAndServices } from '@/components/settings/hours-and-services';
import { Integrations } from '@/components/settings/integrations-panel';
import { Team } from '@/components/settings/team-panel';
import { Account } from '@/components/settings/account-panel';
import { OdooAccount } from '@/components/settings/odoo-account';
import { License } from '@/components/settings/license-panel';
import { can } from '@/lib/rbac';
import type { Workspace } from '@/components/settings/shared';
import type { Role } from '@prisma/client';

/**
 * Settings is a tab host and nothing else.
 *
 * Each tab is its own file: one panel per concern, so a change to Integrations
 * cannot disturb Team, and none of them has to be read to understand this one.
 */
export function SettingsClient({
  workspace,
  role,
  license,
}: {
  workspace: Workspace;
  role: Role;
  license: { status: string; message: string; domain: string; exempt: boolean };
}) {
  const t = useTranslations('settingsPage');
  const toast = useToast();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const tabs = useMemo(
    () =>
      [
        { key: 'business', label: 'Business' },
        { key: 'pricing', label: 'Services & pricing' },
        { key: 'branding', label: 'Branding' },
        can(role, 'integrations:manage') ? { key: 'integrations', label: 'Integrations' } : null,
        can(role, 'integrations:manage') ? { key: 'crypto', label: 'Crypto' } : null,
        can(role, 'integrations:manage') ? { key: 'emails', label: 'Email templates' } : null,
        can(role, 'team:manage') ? { key: 'team', label: 'Team' } : null,
        { key: 'account', label: 'Your account' },
        can(role, 'license:manage') ? { key: 'license', label: 'License' } : null,
      ].filter(Boolean) as { key: string; label: string }[],
    [role],
  );

  const requested = searchParams.get('tab');
  const [tab, setTabState] = useState(() =>
    tabs.some((t) => t.key === requested) ? (requested as string) : 'business',
  );

  // The URL is kept in step with history.replaceState rather than router.replace:
  // a settings tab is a view, not a navigation, and a router push would re-run the
  // server component on every click.
  const setTab = (key: string) => {
    setTabState(key);
    const url = `${window.location.pathname}?tab=${key}`;
    window.history.replaceState(window.history.state, '', url);
  };

  useEffect(() => {
    const onPop = () => {
      const next = new URLSearchParams(window.location.search).get('tab');
      setTabState(next && tabs.some((t) => t.key === next) ? next : 'business');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [tabs]);

  const canEditWorkspace = can(role, 'workspace:write');

  return (
    <>
      <PageHeader title={t('settings')} description={t('workspaceIntegrationsTeamAndLicense')} />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="mt-4 space-y-4">
        {(tab === 'business' || tab === 'branding') && (
          <WorkspaceForm
            workspace={workspace}
            mode={tab}
            canEdit={canEditWorkspace}
            onSaved={() => toast.show('Settings saved.', 'success')}
            onError={(m) => toast.show(m, 'alert')}
          />
        )}
        {(tab === 'business' || tab === 'pricing') && (
          <HoursAndServices
            workspaceId={workspace.id}
            canEdit={canEditWorkspace}
            section={tab === 'pricing' ? 'services' : 'hours'}
            onNotify={(m, t) => toast.show(m, t)}
          />
        )}
        {tab === 'integrations' && <Integrations onNotify={(m, t) => toast.show(m, t)} />}
        {tab === 'crypto' && <CryptoWallets />}
        {tab === 'emails' && <EmailTemplates defaultTestTo={session?.user?.email ?? undefined} />}
        {tab === 'team' && (
          <Team currentUserId={session?.user?.id ?? null} onNotify={(m, t) => toast.show(m, t)} />
        )}
        {tab === 'account' && (
          <>
            <LanguagePicker />
            <Account
              name={session?.user?.name ?? null}
              email={session?.user?.email ?? ''}
              role={role}
              onNotify={(m, t) => toast.show(m, t)}
            />
            <OdooAccount onNotify={(m, t) => toast.show(m, t)} />
            <PushToggle />
          </>
        )}
        {tab === 'license' && <License initial={license} onNotify={(m, t) => toast.show(m, t)} />}
      </div>

      {toast.node}
    </>
  );
}
