import { PageHeader } from '@/components/ui';
import { SalesWorkspace } from '@/components/hub/sales-workspace';

export const metadata = { title: 'Sales' };

/** Odoo CRM leads and tasks with evidence-based priorities, every change reviewed before saving (Jodi's CrmWorkspace). */
export default async function SalesPage({ searchParams }: { searchParams: Promise<{ memberId?: string }> }) {
  const { memberId } = await searchParams;
  const validMemberId = memberId && /^[1-9][0-9]{0,9}$/.test(memberId) ? memberId : undefined;
  return (
    <>
      <PageHeader title="Sales" description="Leads, next actions and tasks from Odoo. Nothing is sent to a customer from here." />
      <SalesWorkspace memberId={validMemberId} />
    </>
  );
}
