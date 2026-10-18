import { PageHeader } from '@/components/ui';
import { SchoolSetup } from '@/components/hub/school-setup';

export const metadata = { title: 'School setup' };

/** What is configured in Odoo and what still needs attention (Jodi's SetupChecklist). */
export default function SchoolSetupPage() {
  return (
    <>
      <PageHeader title="School setup" description="See what is configured in Odoo and what still needs attention." />
      <SchoolSetup />
    </>
  );
}
