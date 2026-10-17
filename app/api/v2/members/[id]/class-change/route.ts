import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/members/{id}/class-change — replace one registration with another class. payload: { fromSessionId, sessionId }; expectedVersion is the new class's. */
export const POST = hubWrite('change_class', 'bookings.write', { id: 'memberId' });
