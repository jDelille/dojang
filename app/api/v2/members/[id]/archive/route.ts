import { hubRead, hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/members/{id}/archive — what archiving would change, and anything blocking it. */
export const GET = hubRead('archive_review', 'members.archive', { id: 'memberId' });

/** POST /api/v2/members/{id}/archive — archive the student. payload: { reason }; expectedVersion from the review. */
export const POST = hubWrite('archive_member', 'members.archive', { id: 'memberId' });
