import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/testing/tests/{id}/promotions — award belts to passing students. payload: { registrationIds, reason, reviewToken }; expectedVersion from the preview. */
export const POST = hubWrite('promote_test_results', 'testing.manage', { id: 'testId' });
