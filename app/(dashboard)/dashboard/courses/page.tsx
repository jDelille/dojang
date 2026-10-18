import { PageHeader } from '@/components/ui';
import { CourseRosters } from '@/components/hub/course-rosters';

export const metadata = { title: 'Course rosters' };

/** Bulk course roster changes, reviewed before Odoo creates or cancels bookings (Jodi's CourseAssignments). */
export default function CoursesPage() {
  return (
    <>
      <PageHeader title="Course rosters" description="Review bulk course assignments before Odoo creates or cancels bookings." />
      <CourseRosters />
    </>
  );
}
