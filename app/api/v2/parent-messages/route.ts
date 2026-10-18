import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/parent-messages — parent messages, replies, students, classes and recent actions in this staff member's scope. */
export const GET = hubRead('context', 'inbox.use');
