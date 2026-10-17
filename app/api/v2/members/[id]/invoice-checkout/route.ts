import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/members/{id}/invoice-checkout — prepare Odoo's secure checkout link. payload: { invoiceId, expectedAmount }. */
export const POST = hubWrite('payment_link', 'members.write', { id: 'memberId' });
