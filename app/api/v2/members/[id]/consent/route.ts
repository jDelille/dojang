import { hubRead, hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/members/{id}/consent — the student's and guardians' channels, consent and consent history. */
export const GET = hubRead('consent_overview', 'messaging.manage', { id: 'memberId' });

/** POST /api/v2/members/{id}/consent — record a consent decision with its source and evidence. payload: { partnerId, channel, purpose, state, source, evidence }. */
export const POST = hubWrite('record_consent', 'messaging.manage', { id: 'memberId' });
