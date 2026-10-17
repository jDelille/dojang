import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/members/{id}/class-checkout — record checkout from a class. payload: { sessionId }. */
export const POST = hubWrite('checkout', 'attendance.mark', { id: 'memberId' });
