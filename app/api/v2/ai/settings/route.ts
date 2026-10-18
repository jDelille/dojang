import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/ai/settings — whether AI drafting is on and the Odoo worker's provider is ready. */
export const GET = hubRead('ai_settings', 'ai.manage');
