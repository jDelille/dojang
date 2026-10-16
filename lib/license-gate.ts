import { prisma } from '@/lib/db';
import { currentDomain, isExemptDomain } from '@/lib/integrations/envato';
import { verifyLicenseKey } from '@/lib/license-key';

/**
 * License enforcement.
 *
 * Everything up to now recorded a purchase code and displayed its status, but
 * nothing acted on it — an unlicensed copy ran at full capability, which makes
 * the whole check decorative.
 *
 * The rules are deliberately forgiving in the ways that protect a paying
 * buyer, and firm in the one way that matters:
 *
 *  - localhost and private ranges never block, so development works offline.
 *  - A brand-new install gets a grace window to find its purchase code rather
 *    than being locked out on first boot.
 *  - A previously-valid license that cannot be re-checked (Envato down, token
 *    expired) keeps working. Losing paying customers to someone else's outage
 *    is worse than briefly serving a refunded one.
 *  - Only an explicitly *invalid* or *expired* license, or an install that ran
 *    out its grace period without entering a code, is blocked.
 */

/** Days a fresh install may run before a purchase code is required. */
const GRACE_DAYS = 7;

/** Days a previously-valid license survives when Envato cannot be reached. */
const STALE_TOLERANCE_DAYS = 30;

export type GateVerdict =
  | { allowed: true; reason: 'exempt' | 'valid' | 'grace' | 'stale-but-trusted'; graceEndsAt?: Date }
  | { allowed: false; reason: 'missing' | 'invalid' | 'domain-mismatch'; message: string };

export async function checkLicense(workspaceId: string): Promise<GateVerdict> {
  const domain = currentDomain();
  if (isExemptDomain(domain)) return { allowed: true, reason: 'exempt' };

  const [license, workspace] = await Promise.all([
    prisma.license.findUnique({ where: { workspaceId } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { createdAt: true } }),
  ]);

  const now = Date.now();

  if (!license) {
    // No code entered. Allow briefly so a buyer can install, look around and
    // find their code — then stop.
    const installedAt = workspace?.createdAt?.getTime() ?? now;
    const graceEndsAt = new Date(installedAt + GRACE_DAYS * 86_400_000);
    if (now < graceEndsAt.getTime()) return { allowed: true, reason: 'grace', graceEndsAt };

    return {
      allowed: false,
      reason: 'missing',
      message:
        'This copy of Roster has not been licensed. Enter the Envato purchase code from your ' +
        'downloads page to continue.',
    };
  }

  // A direct-sale key is self-contained and signed, so it is authoritative on
  // its own — no Envato round trip, and it keeps working offline.
  if (license.envatoPurchaseCode?.startsWith('ROSTER-')) {
    const verdict = verifyLicenseKey(license.envatoPurchaseCode, domain);
    return verdict.valid
      ? { allowed: true, reason: 'valid' }
      : { allowed: false, reason: 'invalid', message: verdict.reason };
  }

  if (license.status === 'invalid') {
    return {
      allowed: false,
      reason: 'invalid',
      message:
        license.message ||
        'Envato does not recognize this purchase code. Check it against your Envato downloads page.',
    };
  }

  // Envato itself reports the domain lock, and the stored domain is checked
  // again here in case the install moved after the last verification.
  if (
    license.status === 'domain_mismatch' ||
    (license.domain && license.domain !== domain && !isExemptDomain(license.domain))
  ) {
    return {
      allowed: false,
      reason: 'domain-mismatch',
      message:
        `This license is registered to ${license.domain}, not ${domain}. ` +
        'Re-verify the purchase code on this domain, or move the install back.',
    };
  }

  if (license.status === 'active') {
    // Envato support expiry is advisory — it ends updates, not the right to
    // run the script — so it is surfaced elsewhere rather than blocking here.
    return { allowed: true, reason: 'valid' };
  }

  // 'unverified' — a code exists but Envato has not confirmed it, usually
  // because no token is configured or their API was unreachable.
  const lastGood = license.verifiedAt?.getTime();
  if (lastGood && now - lastGood < STALE_TOLERANCE_DAYS * 86_400_000) {
    return { allowed: true, reason: 'stale-but-trusted' };
  }

  const installedAt = workspace?.createdAt?.getTime() ?? now;
  const graceEndsAt = new Date(installedAt + GRACE_DAYS * 86_400_000);
  if (now < graceEndsAt.getTime()) return { allowed: true, reason: 'grace', graceEndsAt };

  return {
    allowed: false,
    reason: 'missing',
    message:
      license.message ||
      'This purchase code could not be verified. Re-enter it, or check that ' +
        'LICENSE_API_URL points at a reachable license server.',
  };
}

/** Re-checks every license — run weekly so a refund eventually takes effect. */
export async function recheckAllLicenses() {
  const { verifyAndStoreLicense } = await import('@/lib/integrations/envato');
  const domain = currentDomain();

  const licenses = await prisma.license.findMany({
    where: { status: { in: ['active', 'unverified'] } },
    select: { workspaceId: true, envatoPurchaseCode: true },
  });

  let rechecked = 0;
  for (const license of licenses) {
    try {
      // A direct-sale key is not a purchase code, so sending it to Envato
      // would come back "not a valid code" and mark a paying direct customer
      // invalid every week. Re-check it the way it was issued: its signature,
      // which is also what catches an expiry falling due.
      if (license.envatoPurchaseCode?.startsWith('ROSTER-')) {
        const verdict = verifyLicenseKey(license.envatoPurchaseCode, domain);
        await prisma.license.update({
          where: { workspaceId: license.workspaceId },
          data: {
            status: verdict.valid ? 'active' : 'invalid',
            message: verdict.valid ? 'Direct license key.' : verdict.reason,
            verifiedAt: verdict.valid ? new Date() : undefined,
            lastCheckedAt: new Date(),
          },
        });
      } else {
        await verifyAndStoreLicense(license.workspaceId, license.envatoPurchaseCode);
      }
      rechecked += 1;
    } catch {
      // Leave the stored status alone — the tolerance window above decides
      // what an unreachable Envato means.
    }
  }
  return rechecked;
}
