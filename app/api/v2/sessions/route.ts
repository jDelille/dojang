import { withStaff } from '@/lib/domain/context';
import { respond } from '@/lib/domain/errors';

export const runtime = 'nodejs';

/**
 * GET /api/v2/sessions — classes open for attendance: from 15 minutes before
 * start back to 7 days ago. Instructors see only their own classes (Odoo scopes it).
 */
export const GET = withStaff(async (ctx) => respond(await ctx.read('attendance_sessions'), ctx.correlationId), 'classes.read');
