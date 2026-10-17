import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/members/{id}/photo — replace (base64 JPEG) or remove (null) the contact photo. payload: { image }. */
export const POST = hubWrite('update_member_photo', 'members.write', { id: 'memberId' });
