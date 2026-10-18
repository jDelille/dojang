import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/testing/tests/{id} — one belt test with its registrations and results. */
export const GET = hubRead('testing_roster', 'testing.manage', { id: 'testId' });
