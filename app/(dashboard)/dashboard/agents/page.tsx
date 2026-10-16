import { requireWorkspace } from '@/lib/session';
import { AgentsClient } from '@/components/agents/agents-client';

export const metadata = { title: 'AI Agents' };

export default async function AgentsPage() {
  const { workspace } = await requireWorkspace();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  return <AgentsClient workspaceSlug={workspace.slug} appUrl={appUrl} />;
}
