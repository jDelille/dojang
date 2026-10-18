import { PageHeader } from '@/components/ui';
import { ArchivedMembers } from '@/components/hub/archived-members';

export const metadata = { title: 'Archived students' };

/** Archived students, with a reviewed restore saved under the staff member's own Odoo account (Jodi's ArchivedMembers). */
export default function ArchivedMembersPage() {
  return (
    <>
      <PageHeader title="Archived students" description="Review archived students and restore them with a recorded reason." />
      <ArchivedMembers />
    </>
  );
}
