import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { HUB_COOKIE, HubError, hubConfig, openSession, runHub, type HubRole } from '@/lib/odoo-hub';
import { can, capabilitiesFor, isStaffRole, type Capability } from './capabilities';
import { DomainError, problem } from './errors';

/**
 * Who is acting, derived only from the server session: the Roster user and
 * workspace (next-auth) plus their own Odoo hub session and role (sealed
 * cookie). Nothing here comes from the request body, so a caller cannot pick
 * their tenant, role or Odoo user.
 */
export type TenantContext = {
  userId: string;
  workspaceId: string;
  hubRole: HubRole;
  capabilities: readonly Capability[];
  correlationId: string;
  /** A hub read as this staff member. */
  read: (operation: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** A hub write as this staff member; Odoo replays the saved result for a repeated key. */
  write: (operation: string, payload: Record<string, unknown>, idempotencyKey: string) => Promise<Record<string, unknown>>;
};

/** A browser on another site must not be able to drive this staff member's Odoo session. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function correlationFrom(req: Request) {
  const given = req.headers.get('x-correlation-id');
  return given && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(given) ? given : randomUUID();
}

function clearHubCookie(res: NextResponse) {
  res.cookies.set(HUB_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return res;
}

/**
 * Wraps an /api/v2 handler for Staff Portal users. Refuses before the handler
 * runs when the user is signed out, has no connected Odoo account, is not
 * staff, or lacks `capability`. Errors come back in the one /api/v2 format.
 */
export function withStaff(
  handler: (ctx: TenantContext, req: Request, params: unknown) => Promise<Response>,
  capability?: Capability,
) {
  return async (req: Request, params: unknown): Promise<Response> => {
    const correlationId = correlationFrom(req);
    try {
      if (req.method !== 'GET' && !sameOrigin(req)) throw new DomainError('FORBIDDEN', 403);
      const auth = await getServerSession(authOptions);
      if (!auth?.user?.id) throw new DomainError('NOT_AUTHENTICATED', 401);
      const workspaceId = auth.user.workspaceId;
      if (!workspaceId) throw new DomainError('NO_WORKSPACE', 409);

      const c = hubConfig();
      if (!c) throw new DomainError('HUB_NOT_CONFIGURED', 503);
      const hub = openSession(c, (await cookies()).get(HUB_COOKIE)?.value, auth.user.id, workspaceId);
      if (!hub) throw new DomainError('SIGN_IN_REQUIRED', 401);
      if (!isStaffRole(hub.role) || (capability && !can(hub.role, capability))) throw new DomainError('FORBIDDEN', 403);

      const call = async (operation: string, payload: Record<string, unknown>, key?: string) => {
        try {
          return await runHub(c, hub.session, operation, payload, key);
        } catch (error) {
          if (error instanceof HubError) throw new DomainError(error.code, error.status);
          throw error;
        }
      };
      return await handler(
        {
          userId: auth.user.id,
          workspaceId,
          hubRole: hub.role,
          capabilities: capabilitiesFor(hub.role),
          correlationId,
          read: (operation, payload = {}) => call(operation, payload),
          write: (operation, payload, idempotencyKey) => call(operation, payload, idempotencyKey),
        },
        req,
        params,
      );
    } catch (error) {
      if (error instanceof DomainError) {
        const res = problem(error.code, error.status, correlationId);
        return error.code === 'SIGN_IN_REQUIRED' ? clearHubCookie(res) : res;
      }
      console.error('[api/v2]', correlationId, error);
      return problem('INTERNAL_ERROR', 500, correlationId);
    }
  };
}
