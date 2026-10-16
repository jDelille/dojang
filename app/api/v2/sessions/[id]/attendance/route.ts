import { z } from 'zod';
import { withStaff } from '@/lib/domain/context';
import { envelope, idParam, readEnvelope, recordId } from '@/lib/domain/envelope';
import { DomainError, respond } from '@/lib/domain/errors';

export const runtime = 'nodejs';

/** GET /api/v2/sessions/{id}/attendance — the class roster with each student's mark and version. */
export const GET = withStaff(
  async (ctx, _req, params) => respond(await ctx.read('attendance_sheet', { sessionId: await idParam(params, 'id') }), ctx.correlationId),
  'classes.read',
);

const Mark = envelope(
  z
    .object({
      memberId: recordId,
      status: z.enum(['present', 'late', 'absent', 'excused']),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
);

/**
 * POST /api/v2/sessions/{id}/attendance — mark one student.
 *   { idempotencyKey, expectedVersion (the row's version), payload: { memberId, status, reason } }
 * Instructors may only make first marks on their own classes; changing a mark
 * needs a manager. Odoo enforces both and the attendance window.
 */
export const POST = withStaff(async (ctx, req, params) => {
  const sessionId = await idParam(params, 'id');
  const body = await readEnvelope(req, Mark);
  if (body.expectedVersion === undefined) throw new DomainError('INVALID_COMMAND', 400);
  const result = await ctx.write(
    'mark_attendance',
    { sessionId, ...body.payload, expectedVersion: body.expectedVersion },
    body.idempotencyKey,
  );
  return respond(result, ctx.correlationId);
}, 'attendance.mark');
