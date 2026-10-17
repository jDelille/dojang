import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/leads/{id}/notes — add an internal note (no customer notification). payload: { note }; expectedVersion is the lead's. */
export const POST = hubWrite('add_lead_note', 'leads.write', { id: 'leadId' });
