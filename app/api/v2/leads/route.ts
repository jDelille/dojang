import { withStaff } from '@/lib/domain/context';
import { DomainError, respond } from '@/lib/domain/errors';

export const runtime = 'nodejs';

/** GET /api/v2/leads?q= — the pipeline: leads (optionally searched), stages, open tasks and assignees. */
export const GET = withStaff(async (ctx, req) => {
  const query = new URL(req.url).searchParams.get('q') ?? '';
  if (query.length > 100) throw new DomainError('INVALID_COMMAND', 400);
  return respond(await ctx.read('crm_context', { query }), ctx.correlationId);
}, 'leads.read');
