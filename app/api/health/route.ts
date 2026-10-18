import { ok, withPublic } from '@/lib/api';
import { NO_STORE, releaseInfo } from '@/lib/release';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health — public liveness (Jodi #9/#14). Says the site is up and
 * which build it runs. It does not call Odoo and is not a readiness claim.
 */
export const GET = withPublic(async () => {
  return ok(
    {
      service: 'dojang-roster',
      status: 'reachable',
      ...releaseInfo(),
      backend: 'not_checked',
      readiness: '/api/integration/readiness',
      requires: 'signed_in_staff',
    },
    { headers: NO_STORE },
  );
});
