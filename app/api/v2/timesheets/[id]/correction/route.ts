import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/timesheets/{id}/correction — correct a closed draft shift. payload: { checkIn, checkOut, reason }; expectedVersion is the shift's. Odoo allows this only for staff who may correct timesheets. */
export const POST = hubWrite('correct_timesheet', 'instructor.use', { id: 'shiftId' });
