import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { SalesLead } from '@/components/hub/sales-lead';

export const metadata = { title: 'Lead' };

/** One Odoo lead: evidence, next action, owner, notes, stage proposal, tasks and its trial (Jodi's CrmWorkspace + TrialPanel). */
export default async function SalesLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9][0-9]{0,9}$/.test(id)) notFound();
  return (
    <>
      <PageHeader title="Lead" description="Every change is reviewed first and saved under your own Odoo account." />
      <SalesLead leadId={id} />
    </>
  );
}
