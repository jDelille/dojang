import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/courses/{id}/assignment — add or remove course members. payload: { addMemberIds, removeMemberIds, reason, reviewToken }; expectedVersion from the preview. */
export const POST = hubWrite('assign_course_members', 'courses.manage', { id: 'templateId' });
