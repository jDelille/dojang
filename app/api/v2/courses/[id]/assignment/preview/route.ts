import { hubPreview } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/courses/{id}/assignment/preview — bookings Odoo would create or cancel. payload: { addMemberIds, removeMemberIds }. */
export const POST = hubPreview('course_assignment_preview', 'courses.manage', { id: 'templateId' });
