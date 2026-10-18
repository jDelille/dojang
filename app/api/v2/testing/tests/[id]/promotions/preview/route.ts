import { hubPreview } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/testing/tests/{id}/promotions/preview — belts that promoting would award, and any conflicts. payload: { registrationIds }. */
export const POST = hubPreview('promotion_preview', 'testing.manage', { id: 'testId' });
