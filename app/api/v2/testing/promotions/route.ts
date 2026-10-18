import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/testing/promotions?query= — belt history, including reversed awards. Always send query. */
export const GET = hubRead('promotion_history', 'testing.manage');
