import { PageHeader } from '@/components/ui';
import { StudentIntake } from '@/components/hub/student-intake';

export const metadata = { title: 'New student' };

/** Create a new student (and, for a child, a guardian household) in Odoo, reviewed first and saved under the staff member's own account (Jodi's StudentIntake). */
export default function NewStudentPage() {
  return (
    <>
      <PageHeader title="New student" description="Odoo checks the fields and looks for existing records before anything is created." />
      <StudentIntake />
    </>
  );
}
