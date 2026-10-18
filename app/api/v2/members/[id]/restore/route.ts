import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/members/{id}/restore — make an archived student active again. payload: { reason }; expectedVersion from the archived list. */
export const POST = hubWrite('restore_member', 'members.archive', { id: 'memberId' });
