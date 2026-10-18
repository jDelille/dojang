import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/testing/tests/{id}/results — save results. payload: { results: [{ registrationId, result }], reason }; expectedVersion is the test's. */
export const POST = hubWrite('record_test_results', 'testing.manage', { id: 'testId' });
