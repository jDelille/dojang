import { z } from 'zod';
import { fail, ok, parseBody, withWorkspace } from '@/lib/api';
import { CompanionProblem, companionOdooConfigured, prepareFollowUp, problemStatus } from '@/lib/companion-odoo';

const recordId = z.string().regex(/^[1-9][0-9]{0,9}$/);
const key = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{15,127}$/);
const schema = z.object({
  memberId: recordId,
  sessionId: recordId,
  text: z.string().trim().min(1).max(1500),
  idempotencyKey: key,
  correlationId: key,
});

/**
 * POST /api/companion/prepare — a staff-entered parent report becomes a
 * follow-up draft in Odoo for review. Nothing is sent.
 */
export const POST = withWorkspace(async (_ctx, req) => {
  const body = await parseBody(req, schema);
  if (!companionOdooConfigured()) return fail(503, 'unavailable');
  try {
    return ok({ suggestion: await prepareFollowUp(body) });
  } catch (error) {
    if (error instanceof CompanionProblem) return fail(problemStatus(error.code), error.code);
    console.error('[companion] prepare failed', error);
    return fail(503, 'unavailable');
  }
});
