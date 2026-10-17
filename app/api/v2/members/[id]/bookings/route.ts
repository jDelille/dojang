import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/members/{id}/bookings — book the member into a future class. payload: { sessionId }; expectedVersion is the class's. */
export const POST = hubWrite('book', 'bookings.write', { id: 'memberId' });
