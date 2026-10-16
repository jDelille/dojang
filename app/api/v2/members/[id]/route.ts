import { withStaff } from '@/lib/domain/context';
import { idParam } from '@/lib/domain/envelope';
import { respond } from '@/lib/domain/errors';

export const runtime = 'nodejs';

/**
 * GET /api/v2/members/{id} — one student's workspace: profile, belt, courses,
 * attendance, billing summary and family. Odoo limits instructors to students
 * in their classes.
 */
export const GET = withStaff(
  async (ctx, _req, params) => respond(await ctx.read('member_workspace', { memberId: await idParam(params, 'id') }), ctx.correlationId),
  'members.read',
);
