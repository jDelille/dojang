import { requireWorkspace } from '@/lib/session';
import { CallsClient } from '@/components/calls/calls-client';

export const metadata = { title: 'Calls' };

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ missed?: string }>;
}) {
  await requireWorkspace();
  const params = await searchParams;
  return <CallsClient initialMissedOnly={params.missed === '1'} />;
}
