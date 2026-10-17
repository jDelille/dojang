import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/members/{id}/profile — change name, email or phone. payload: { expectedPartnerVersion, changes }. */
export const POST = hubWrite('update_member', 'members.write', { id: 'memberId' });
