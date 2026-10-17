import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/trials/{id}/cancellation — cancel a reserved trial; the student returns to lead status. payload: { reason }; expectedVersion is the trial's. */
export const POST = hubWrite('cancel_trial', 'leads.write', { id: 'trialId' });
