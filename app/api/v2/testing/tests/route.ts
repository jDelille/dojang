import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/testing/tests — create a testing roster. payload: { testId: null, name, testDate, add, removeRegistrationIds, reason }; expectedVersion 0. */
export const POST = hubWrite('save_testing_roster', 'testing.manage');
