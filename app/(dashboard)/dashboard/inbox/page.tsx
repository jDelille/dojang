import { PageHeader } from '@/components/ui';
import { ParentMessages } from '@/components/hub/parent-messages';

export const metadata = { title: 'Inbox' };

/**
 * Parent messages from Odoo (Jodi's Hub inbox). The template's Prisma inbox
 * (components/inbox/inbox-client.tsx) is no longer shown: Roster doesn't use Prisma.
 */
export default function InboxPage() {
  return (
    <>
      <PageHeader title="Inbox" description="Review customer messages, prepare replies and arrange classes." />
      <ParentMessages />
    </>
  );
}
