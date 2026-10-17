import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/instructor/clock — clock the signed-in instructor in or out. payload: { direction: 'in' | 'out', currentShiftId, pin }. */
export const POST = hubWrite('instructor_clock', 'instructor.use');
