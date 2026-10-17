import { hubRead, hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/members/{id}/kiosk-access — household guardians and their kiosk PIN state. */
export const GET = hubRead('guardian_kiosk_access', 'members.write', { id: 'memberId' });

/** POST /api/v2/members/{id}/kiosk-access — set a guardian's 6-digit kiosk PIN. payload: { guardianId, pin, reason }. */
export const POST = hubWrite('set_guardian_kiosk_pin', 'members.write', { id: 'memberId' });
