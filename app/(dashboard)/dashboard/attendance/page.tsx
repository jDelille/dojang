import { PageHeader } from '@/components/ui';
import { AttendanceReview } from '@/components/hub/attendance-review';

export const metadata = { title: 'Attendance review' };

/** Record or correct class attendance with a reviewed, audited change (Jodi's PR #31). */
export default function AttendancePage() {
  return (
    <>
      <PageHeader title="Attendance review" description="Record or correct class attendance with a reviewed, audited change." />
      <AttendanceReview />
    </>
  );
}
