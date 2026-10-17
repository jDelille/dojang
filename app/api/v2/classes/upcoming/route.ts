import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/classes/upcoming — open classes that have not ended (used to pick a replacement or booking). */
export const GET = hubRead('context', 'classes.read');
