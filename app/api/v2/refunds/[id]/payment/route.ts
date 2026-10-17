import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/refunds/{id}/payment — record that the money was returned at the desk. payload: { reason }. */
export const POST = hubWrite('record_refund_payment', 'members.write', { id: 'refundId' });
