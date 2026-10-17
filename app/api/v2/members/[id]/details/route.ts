import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/members/{id}/details — profile, ranks, bookings, attendance and billing for managing one member. */
export const GET = hubRead('member_details', 'members.read', { id: 'memberId' });
