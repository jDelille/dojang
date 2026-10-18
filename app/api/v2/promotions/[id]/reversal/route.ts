import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/promotions/{id}/reversal — reverse a belt award (kept in history). payload: { reason }; expectedVersion is the member's. */
export const POST = hubWrite('reverse_promotion', 'testing.manage', { id: 'rankHistoryId' });
