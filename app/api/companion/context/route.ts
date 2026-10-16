import { fail, ok, withWorkspace } from '@/lib/api';
import { companionOdooConfigured, isRecordId, loadOdooContext } from '@/lib/companion-odoo';

/**
 * GET /api/companion/context?memberId=|sessionId= — Odoo's companion context
 * for that page: enrolled sessions, saved follow-ups, Odoo suggestions.
 */
export const GET = withWorkspace(async (_ctx, req) => {
  const params = new URL(req.url).searchParams;
  const memberId = params.get('memberId');
  const sessionId = params.get('sessionId');
  if ((memberId && !isRecordId(memberId)) || (sessionId && !isRecordId(sessionId)) || (memberId && sessionId)) {
    return fail(400, 'Invalid page.');
  }
  if (!companionOdooConfigured()) return ok({ status: 'notConfigured' });
  try {
    return ok({ status: 'online', ...(await loadOdooContext(memberId, sessionId)) });
  } catch (error) {
    console.error('[companion] context failed', error);
    return ok({ status: 'offline' });
  }
});
