import { ok, searchParams, withWorkspace } from '@/lib/api';
import { findOpenSlots } from '@/lib/integrations/calendar';

/**
 * Open booking slots. Also read by the AI agent so it can offer real times
 * during a chat or call instead of inventing availability (spec §4.5).
 */
export const GET = withWorkspace(async (ctx, req) => {
  const sp = searchParams(req);

  const slots = await findOpenSlots(ctx.workspaceId, {
    days: Math.min(Number(sp.get('days') ?? 7) || 7, 30),
    durationMinutes: Math.min(Number(sp.get('duration') ?? 30) || 30, 480),
    limit: Math.min(Number(sp.get('limit') ?? 12) || 12, 50),
  });

  return ok({
    slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
  });
}, 'leads:read');
