import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/**
 * POST /api/v2/ai/activation — run one synthetic draft and, if it works, turn
 * on AI drafting. Odoo allows owners only and checks expectedSiteVersion and
 * expectedConfigVersion from the payload.
 */
export const POST = hubWrite('enable_ai', 'ai.manage');
