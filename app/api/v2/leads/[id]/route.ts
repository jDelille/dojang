import { withStaff } from '@/lib/domain/context';
import { idParam } from '@/lib/domain/envelope';
import { respond } from '@/lib/domain/errors';

export const runtime = 'nodejs';

/** GET /api/v2/leads/{id} — one lead with its stage, tasks, notes, trial and timeline. */
export const GET = withStaff(
  async (ctx, _req, params) => respond(await ctx.read('lead_details', { leadId: await idParam(params, 'id') }), ctx.correlationId),
  'leads.read',
);
