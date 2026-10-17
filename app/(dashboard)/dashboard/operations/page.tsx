import { PageHeader } from '@/components/ui';
import { OperationsReports } from '@/components/hub/operations-reports';

export const metadata = { title: 'Operations reports' };

/** School-wide operations report and printable class rosters, read-only from Odoo (Jodi's OperationsWorkspace). */
export default function OperationsPage() {
  return (
    <>
      <PageHeader title="Operations reports" description="Attendance, instructor workload, belts and families, plus printable class rosters." />
      <OperationsReports />
    </>
  );
}
