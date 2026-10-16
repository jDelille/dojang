import { requireWorkspace } from '@/lib/session';
import { getLicenseStatus } from '@/lib/integrations/envato';
import { SettingsClient } from '@/components/settings/settings-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { user, workspace, workspaceId } = await requireWorkspace();
  const license = await getLicenseStatus(workspaceId);

  return (
    <SettingsClient
      role={user.role}
      workspace={{
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        customDomain: workspace.customDomain,
        logoUrl: workspace.logoUrl,
        accentColor: workspace.accentColor,
        timezone: workspace.timezone,
        currency: workspace.currency,
        niche: workspace.niche,
        businessName: workspace.businessName,
        businessPhone: workspace.businessPhone,
        businessEmail: workspace.businessEmail,
        businessAddress: workspace.businessAddress,
      }}
      license={{
        status: license.status,
        message: license.message,
        domain: license.domain,
        exempt: license.exempt,
      }}
    />
  );
}
