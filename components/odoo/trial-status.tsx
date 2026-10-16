import { Pill } from '@/components/odoo/shared';
import type { CrmLead } from '@/lib/odoo-crm';

export function TrialStatus({ lead, t }: { lead: CrmLead; t: (key: string) => string }) {
  if (lead.converted) return <Pill tone="success">{t('leads.converted')}</Pill>;
  if (lead.noShow) return <Pill tone="alert">{t('leads.noShow')}</Pill>;
  if (lead.trialAttended) return <Pill tone="success">{t('leads.attended')}</Pill>;
  if (lead.trialSession) return <span className="text-xs">{lead.trialSession}</span>;
  return <span className="text-xs muted">—</span>;
}
