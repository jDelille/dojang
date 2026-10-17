import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/refunds/{id}/approve — owner approval; posts the credit note. payload: { reason }. */
export const POST = hubWrite('approve_refund', 'members.write', { id: 'refundId' });
