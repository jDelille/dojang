import { hubPreview } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/trials/{id}/conversion/preview — what converting an attended trial to a membership would create. Nothing is saved. payload: { planId, startDate }. */
export const POST = hubPreview('conversion_preview', 'leads.write', { id: 'trialId' });
