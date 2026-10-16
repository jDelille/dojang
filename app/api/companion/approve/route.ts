import { z } from 'zod';
import { fail, ok, parseBody, withWorkspace } from '@/lib/api';
import { CompanionProblem, approveSuggestion, companionOdooConfigured, problemStatus } from '@/lib/companion-odoo';

const recordId = z.string().regex(/^[1-9][0-9]{0,9}$/);
const key = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{15,127}$/);
const schema = z
  .object({
    memberId: recordId,
    suggestionId: z.string().regex(/^(followup|attendance-review):[1-9][0-9]{0,9}$/),
    idempotencyKey: key,
    correlationId: key,
  })
  .refine((v) => !v.suggestionId.startsWith('attendance-review:') || v.suggestionId === `attendance-review:${v.memberId}`);

/**
 * POST /api/companion/approve — run one approved Odoo suggestion and return
 * its receipt. A retry after a lost answer must resend the same keys.
 */
export const POST = withWorkspace(async (_ctx, req) => {
  const body = await parseBody(req, schema);
  if (!companionOdooConfigured()) return fail(503, 'unavailable');
  try {
    return ok(await approveSuggestion(body));
  } catch (error) {
    if (error instanceof CompanionProblem) return fail(problemStatus(error.code), error.code);
    console.error('[companion] approve failed', error);
    return fail(503, 'unavailable');
  }
});
