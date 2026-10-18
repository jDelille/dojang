import { PageHeader } from '@/components/ui';
import { FollowUps } from '@/components/hub/follow-ups';

export const metadata = { title: 'Follow-ups' };

/** Reviewed and saved parent follow-ups (Jodi's follow-ups page, PR #17). */
export default function FollowUpsPage() {
  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Reviewed drafts and saved follow-ups. Prepare a new one from a member’s Companion."
      />
      <FollowUps />
    </>
  );
}
