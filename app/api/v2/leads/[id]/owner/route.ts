import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/leads/{id}/owner — assign the lead to a staff member. payload: { ownerId }; expectedVersion is the lead's. */
export const POST = hubWrite('assign_lead', 'leads.write', { id: 'leadId' });
