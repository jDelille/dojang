import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/sessions/{id}/roster — the class's current registered roster with belts and recorded attendance. */
export const GET = hubRead('session_roster', 'reports.read', { id: 'sessionId' });
