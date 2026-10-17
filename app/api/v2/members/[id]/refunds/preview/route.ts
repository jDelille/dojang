import { hubPreview } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/members/{id}/refunds/preview — what a refund would do, plus the reviewToken to request it. payload: { invoiceId }. */
export const POST = hubPreview('refund_preview', 'members.write', { id: 'memberId' });
