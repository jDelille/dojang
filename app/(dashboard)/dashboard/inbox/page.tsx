import { requireWorkspace } from '@/lib/session';
import { InboxClient } from '@/components/inbox/inbox-client';

export const metadata = { title: 'Inbox' };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  await requireWorkspace();
  const params = await searchParams;
  return <InboxClient initialConversationId={params.conversation} />;
}
