import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/trials/{id}/outcome — record attended or no-show. payload: { outcome, reason }; expectedVersion is the trial's. */
export const POST = hubWrite('record_trial_outcome', 'leads.write', { id: 'trialId' });
