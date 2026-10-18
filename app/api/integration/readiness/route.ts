import { ok, withWorkspace } from '@/lib/api';
import { companionOdooConfigured, probeReadiness } from '@/lib/companion-odoo';
import { hubConfig } from '@/lib/odoo-hub';
import { odooConfigured } from '@/lib/odoo';
import { NO_STORE, releaseInfo } from '@/lib/release';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integration/readiness — signed-in staff only (Jodi #9/#14).
 * Makes one real read through the staff gateway and reports counts and
 * on/off flags only: no member details, no credentials.
 *
 * Hub actions, the ORM reads, kiosk reads and message delivery are not
 * exercised here, so they are reported as configured or not_checked, never
 * as working. productionReady is always false.
 */
export const GET = withWorkspace(async () => {
  const configured = {
    hub: hubConfig() ? 'configured_not_exercised' : 'not_configured',
    ormReads: odooConfigured() ? 'configured_not_exercised' : 'not_configured',
    kioskRead: 'not_checked',
    externalMessaging: 'not_checked',
    makeupBooking: 'not_checked',
  };
  const base = { service: 'dojang-roster', ...releaseInfo(), scope: 'staff_gateway_reads', productionReady: false };
  const checkedAt = new Date().toISOString();

  if (!companionOdooConfigured()) {
    return ok({ ...base, status: 'not_configured', backend: 'not_checked', capabilities: configured, checkedAt }, { status: 503, headers: NO_STORE });
  }

  try {
    const probe = await probeReadiness();
    const usable = probe.memberCount > 0 && probe.sessionCount > 0 && probe.followUpEnabled;
    return ok(
      {
        ...base,
        status: usable ? 'connected_test_ready' : 'connected_test_incomplete',
        backend: 'verified_read_round_trip',
        checks: { staffRead: true, companionRead: true, memberCount: probe.memberCount, sessionCount: probe.sessionCount },
        capabilities: {
          ...configured,
          internalFollowUp: probe.followUpEnabled,
          ai: probe.aiEnabled && probe.aiCredentialConfigured ? 'configured_not_exercised' : 'not_configured',
          ebGym: probe.ebGymInstalled ? 'installed_not_integration_verified' : 'not_installed',
        },
        checkedAt,
      },
      { status: usable ? 200 : 503, headers: NO_STORE },
    );
  } catch (error) {
    console.error('[readiness] probe failed', error instanceof Error ? error.message : error);
    return ok({ ...base, status: 'backend_unavailable', backend: 'read_failed', capabilities: configured, checkedAt }, { status: 503, headers: NO_STORE });
  }
});
