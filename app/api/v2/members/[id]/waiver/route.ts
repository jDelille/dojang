import { hubRead, hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/members/{id}/waiver — the waiver text, its state and who may sign. */
export const GET = hubRead('waiver_context', 'members.write', { id: 'memberId' });

/** POST /api/v2/members/{id}/waiver — save a witnessed signature. payload: { signerPartnerId, signedByName, contentVersion, agreed, signature }. */
export const POST = hubWrite('sign_waiver', 'members.write', { id: 'memberId' });
