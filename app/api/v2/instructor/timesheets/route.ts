import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/instructor/timesheets — the signed-in instructor's profile, open shift and recent shifts (the team's for managers). */
export const GET = hubRead('instructor_context', 'instructor.use');
