import { prisma } from '@/lib/db';
import { fail, ok, withWorkspace } from '@/lib/api';
import { odooConfigured } from '@/lib/odoo';
import { loadCompanionBrief } from '@/lib/companion';

/**
 * GET /api/companion/brief?path=/dashboard/... — the Companion's cards and
 * chips for that page. Read-only Odoo, rule-based; no model call.
 */
export const GET = withWorkspace(async (ctx, req) => {
  const path = new URL(req.url).searchParams.get('path') ?? '/dashboard';
  if (!path.startsWith('/dashboard')) return fail(400, 'Unknown page.');
  if (!odooConfigured()) return ok({ status: 'notConfigured', cards: [], chips: [] });

  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { timezone: true },
  });
  try {
    const brief = await loadCompanionBrief(path, workspace?.timezone ?? 'UTC');
    return ok({ status: 'online', ...brief });
  } catch (error) {
    console.error('[companion] brief failed', error);
    return ok({ status: 'offline', cards: [], chips: [] });
  }
});
