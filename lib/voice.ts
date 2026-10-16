import { prisma } from '@/lib/db';

/**
 * Shared helpers for the Twilio voice webhooks.
 *
 * A workspace is identified from the number Twilio dialled. In single-tenant
 * mode there is only one workspace, so we fall back to it rather than 404ing
 * a live phone call.
 */

export async function resolveWorkspaceByNumber(toNumber: string): Promise<string | null> {
  const normalized = toNumber.replace(/[^\d+]/g, '');

  const byBusinessPhone = await prisma.workspace.findFirst({
    where: { businessPhone: { contains: normalized.slice(-10) } },
    select: { id: true },
  });
  if (byBusinessPhone) return byBusinessPhone.id;

  if (process.env.ROSTER_TENANCY_MODE !== 'multi') {
    const only = await prisma.workspace.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return only?.id ?? null;
  }

  // Multi-tenant: match the Twilio number stored on the workspace's integration.
  const integrations = await prisma.integration.findMany({
    where: { provider: 'twilio', isActive: true },
    select: { workspaceId: true, config: true },
  });

  for (const integration of integrations) {
    const config = (integration.config ?? {}) as { phoneNumber?: string };
    if (config.phoneNumber && config.phoneNumber.replace(/[^\d+]/g, '') === normalized) {
      return integration.workspaceId;
    }
  }

  return null;
}

export function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${path}`;
}

/** Twilio posts application/x-www-form-urlencoded. */
export async function readTwilioForm(req: Request): Promise<Record<string, string>> {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

/** Rebuilds the exact URL Twilio signed, which the signature check needs. */
export function requestUrl(req: Request): string {
  const url = new URL(req.url);
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedHost) {
    url.host = forwardedHost;
    if (forwardedProto) url.protocol = `${forwardedProto}:`;
  }
  return url.toString();
}
