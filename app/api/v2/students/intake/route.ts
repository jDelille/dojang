import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/students/intake?query= — school name, guardian households matching `query`, and this staff member's recent intakes. */
export const GET = hubRead('intake_context', 'students.create');
