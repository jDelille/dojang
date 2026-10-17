import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/leads/{id}/next-action — save an internal review task for a follow-up, trial, reactivation or conversion. payload: { kind, reason, due }. */
export const POST = hubWrite('prepare_lead_action', 'leads.write', { id: 'leadId' });
