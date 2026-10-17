import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/leads/{id}/details — change the lead's title or contact fields. payload: { changes }; expectedVersion is the lead's. */
export const POST = hubWrite('update_lead', 'leads.write', { id: 'leadId' });
