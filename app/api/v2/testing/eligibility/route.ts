import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/testing/eligibility?query= — students with belt now and next, attendance progress, ranks and saved tests. Always send query. */
export const GET = hubRead('testing_eligibility', 'testing.manage');
