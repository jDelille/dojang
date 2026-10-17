import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/leads/{id}/stage-proposal — create a review task proposing a stage change; the stage itself does not move. payload: { stageId, reason, due }. */
export const POST = hubWrite('propose_stage', 'leads.write', { id: 'leadId' });
