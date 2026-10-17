import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/members/{id}/billing — posted invoices with their payments and refunds. */
export const GET = hubRead('billing_ledger', 'members.write', { id: 'memberId' });
