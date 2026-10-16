import { withStaff } from '@/lib/domain/context';
import { respond } from '@/lib/domain/errors';

export const runtime = 'nodejs';

/**
 * GET /api/v2/me — the signed-in staff member's hub role and what they may do,
 * for showing or hiding actions. Answers from the sealed session, no Odoo call;
 * a missing or expired Odoo sign-in returns SIGN_IN_REQUIRED.
 */
export const GET = withStaff(async (ctx) =>
  respond({ role: ctx.hubRole, capabilities: ctx.capabilities }, ctx.correlationId),
);
