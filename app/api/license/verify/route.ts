import { ok, parseBody, withWorkspace } from '@/lib/api';
import { licenseVerifySchema } from '@/lib/validation';
import { currentDomain, getLicenseStatus, verifyAndStoreLicense } from '@/lib/integrations/envato';
import { looksLikeLicenseKey, verifyLicenseKey } from '@/lib/license-key';
import { prisma } from '@/lib/db';

/** Envato purchase code + domain check (spec §4.11, §6). */

export const GET = withWorkspace(async (ctx) => {
  const status = await getLicenseStatus(ctx.workspaceId);
  return ok(status);
}, 'workspace:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, licenseVerifySchema);
  const domain = body.domain || currentDomain();

  // Direct-sale keys are signed and self-contained, so they are settled here
  // without an Envato round trip — which is what lets them work offline.
  if (looksLikeLicenseKey(body.purchaseCode)) {
    const verdict = verifyLicenseKey(body.purchaseCode, domain);

    await prisma.license.upsert({
      where: { workspaceId: ctx.workspaceId },
      create: {
        workspaceId: ctx.workspaceId,
        envatoPurchaseCode: body.purchaseCode.trim(),
        domain: verdict.valid ? (verdict.payload.d === '*' ? domain : verdict.payload.d) : domain,
        status: verdict.valid ? 'active' : 'invalid',
        message: verdict.valid ? 'Direct license key.' : verdict.reason,
        buyerName: verdict.valid ? verdict.payload.b ?? null : null,
        itemName: verdict.valid ? verdict.payload.p ?? 'Roster' : null,
        supportedUntil: verdict.valid && verdict.payload.e ? new Date(verdict.payload.e * 1000) : null,
        verifiedAt: verdict.valid ? new Date() : null,
        lastCheckedAt: new Date(),
      },
      update: {
        envatoPurchaseCode: body.purchaseCode.trim(),
        domain: verdict.valid ? (verdict.payload.d === '*' ? domain : verdict.payload.d) : domain,
        status: verdict.valid ? 'active' : 'invalid',
        message: verdict.valid ? 'Direct license key.' : verdict.reason,
        buyerName: verdict.valid ? verdict.payload.b ?? null : null,
        supportedUntil: verdict.valid && verdict.payload.e ? new Date(verdict.payload.e * 1000) : null,
        verifiedAt: verdict.valid ? new Date() : null,
        lastCheckedAt: new Date(),
      },
    });

    return ok({
      status: verdict.valid ? 'active' : 'invalid',
      message: verdict.valid ? 'License key accepted.' : verdict.reason,
      domain,
      source: 'direct',
    });
  }

  const result = await verifyAndStoreLicense(
    ctx.workspaceId,
    body.purchaseCode,
    domain,
  );

  return ok(result);
}, 'license:manage');
