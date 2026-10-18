import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/courses?templateId= — active courses, plus the chosen course's roster and candidates. Always send templateId (empty for none). */
export const GET = hubRead('course_roster', 'courses.manage');
