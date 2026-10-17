import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/members/{id}/refunds — request a full refund of an invoice. payload: { invoiceId, reason, reviewToken }. */
export const POST = hubWrite('request_refund', 'members.write', { id: 'memberId' });
