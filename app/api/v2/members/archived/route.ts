import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/members/archived?query= — archived students, newest change first (up to 50). Always send query (empty for all). */
export const GET = hubRead('archived_members', 'members.archive');
