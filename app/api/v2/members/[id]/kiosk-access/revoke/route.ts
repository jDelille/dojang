import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/members/{id}/kiosk-access/revoke — turn off a guardian's kiosk PIN. payload: { guardianId, reason }. */
export const POST = hubWrite('revoke_guardian_kiosk_pin', 'members.write', { id: 'memberId' });
