import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/refunds/{id}/cancel — cancel a refund request before approval. payload: { reason }. */
export const POST = hubWrite('cancel_refund', 'members.write', { id: 'refundId' });
