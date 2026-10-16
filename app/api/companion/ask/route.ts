import { z } from 'zod';
import { ok, parseBody, withWorkspace } from '@/lib/api';
import { askOdoo, companionOdooConfigured } from '@/lib/companion-odoo';

const recordId = z.string().regex(/^[1-9][0-9]{0,9}$/);
const schema = z
  .object({ text: z.string().trim().min(1).max(500), memberId: recordId.nullish(), sessionId: recordId.nullish() })
  .refine((v) => !(v.memberId && v.sessionId));

/** POST /api/companion/ask — Odoo's read-only answer over scoped records. */
export const POST = withWorkspace(async (_ctx, req) => {
  const body = await parseBody(req, schema);
  if (!companionOdooConfigured()) return ok({ outcome: 'unavailable' });
  return ok(await askOdoo(body.text, body.memberId ?? null, body.sessionId ?? null));
});
