import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/school/setup — which parts of the school's Odoo setup are ready. */
export const GET = hubRead('setup_checklist', 'setup.read');
