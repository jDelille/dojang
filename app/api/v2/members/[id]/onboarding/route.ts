import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/members/{id}/onboarding — which onboarding steps are done. */
export const GET = hubRead('member_onboarding', 'members.read', { id: 'memberId' });
