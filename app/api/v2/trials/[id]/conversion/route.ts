import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/trials/{id}/conversion — convert an attended trial to a membership. payload: { planId, startDate, reason, reviewToken }; expectedVersion is from the preview. */
export const POST = hubWrite('convert_trial', 'leads.write', { id: 'trialId' });
