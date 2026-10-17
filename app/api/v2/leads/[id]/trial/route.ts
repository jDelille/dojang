import { hubRead, hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/leads/{id}/trial?query= — the lead's trials, students matching query, upcoming classes and membership plans. */
export const GET = hubRead('trial_context', 'leads.write', { id: 'leadId' });

/** POST /api/v2/leads/{id}/trial — reserve a trial class for an existing student. payload: { expectedLeadVersion, memberId, sessionId, expectedSessionVersion, reason }. */
export const POST = hubWrite('reserve_trial', 'leads.write', { id: 'leadId' });
