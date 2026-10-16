import { prisma } from '@/lib/db';
import { fail, ok, searchParams, withPublic } from '@/lib/api';

/**
 * Public widget bootstrap. Returns only what the embed needs to render —
 * never keys, never anything about other workspaces.
 */
export const GET = withPublic(async (req) => {
  const slug = searchParams(req).get('workspace');
  if (!slug) return fail(400, 'Provide ?workspace=<slug>.');

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      businessName: true,
      accentColor: true,
      logoUrl: true,
      agents: {
        where: { isActive: true, channels: { has: 'chat' } },
        orderBy: { isDefault: 'desc' },
        take: 1,
        select: { id: true, name: true, greeting: true },
      },
    },
  });

  if (!workspace || !workspace.agents.length) {
    return fail(404, 'No chat agent is available for that workspace.');
  }

  const agent = workspace.agents[0];

  return ok({
    businessName: workspace.businessName || workspace.name,
    accentColor: workspace.accentColor || '#E8A33D',
    logoUrl: workspace.logoUrl,
    agentName: agent.name,
    greeting: agent.greeting || `Hi! How can I help?`,
  });
});

export const OPTIONS = withPublic(async () => new Response(null, { status: 204 }));
