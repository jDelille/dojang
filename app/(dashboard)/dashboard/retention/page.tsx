import { requireWorkspace } from '@/lib/session';
import { RetentionClient } from '@/components/retention/retention-client';

export const metadata = { title: 'Retention' };

export default async function RetentionPage() {
  await requireWorkspace();
  return <RetentionClient />;
}
