import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/members/{id}/rank — award a rank. payload: { rankId, stripes, reason }. */
export const POST = hubWrite('rank', 'members.write', { id: 'memberId' });
