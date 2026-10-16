import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { fail, ok, withWorkspace } from '@/lib/api';
import { sameOrigin } from '@/lib/domain/context';
import {
  HUB_COOKIE,
  HUB_COOKIE_MAX_AGE,
  HubError,
  connectHub,
  disconnectHub,
  hubConfig,
  openSession,
  runHub,
  sealSession,
} from '@/lib/odoo-hub';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'private, no-store' };
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const hubFail = (code: string, status: number) =>
  ok({ error: { code, status } }, { status, headers: NO_STORE });

function setCookie(res: NextResponse, value: string, maxAge: number) {
  res.cookies.set(HUB_COOKIE, value, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
  return res;
}

/**
 * GET /api/hub — whether this staff member's Odoo account is connected and,
 * if so, Odoo's hub context for them (their Odoo user, role and site).
 */
export const GET = withWorkspace(async (ctx) => {
  const c = hubConfig();
  if (!c) return ok({ status: 'notConfigured' }, { headers: NO_STORE });
  const hub = openSession(c, (await cookies()).get(HUB_COOKIE)?.value, ctx.userId, ctx.workspaceId);
  if (!hub) return ok({ status: 'disconnected' }, { headers: NO_STORE });
  try {
    const context = await runHub(c, hub.session, 'context', {}, undefined);
    return ok({ status: 'connected', context }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof HubError && error.status === 401) {
      return setCookie(ok({ status: 'disconnected' }, { headers: NO_STORE }), '', 0);
    }
    return ok({ status: 'offline' }, { headers: NO_STORE });
  }
});

/**
 * POST /api/hub — the Odoo account connection only:
 *   { operation: 'connect', login, password } — sign in to Odoo as yourself
 *   { operation: 'disconnect' }
 * Business reads and writes go through /api/v2, never by operation name.
 */
export const POST = withWorkspace(async (ctx, req) => {
  if (!sameOrigin(req)) return fail(403, 'Forbidden');
  const c = hubConfig();
  if (!c) return hubFail('HUB_NOT_CONFIGURED', 503);

  const text = await req.text();
  if (text.length > 16_384) return hubFail('INVALID_COMMAND', 413);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return hubFail('INVALID_COMMAND', 400);
  }
  if (!isObject(data)) return hubFail('INVALID_COMMAND', 400);

  if (data.operation === 'connect') {
    const { login, password } = data;
    if (
      typeof login !== 'string' ||
      !login.trim() ||
      login.length > 200 ||
      typeof password !== 'string' ||
      !password ||
      password.length > 1024
    ) {
      return hubFail('INVALID_COMMAND', 400);
    }
    try {
      const { session, role, context } = await connectHub(c, login.trim(), password);
      return setCookie(
        ok({ status: 'connected', context }, { headers: NO_STORE }),
        sealSession(c, session, role, ctx.userId, ctx.workspaceId),
        HUB_COOKIE_MAX_AGE,
      );
    } catch (error) {
      if (error instanceof HubError) return hubFail(error.code, error.status);
      throw error;
    }
  }

  if (data.operation === 'disconnect') {
    const hub = openSession(c, (await cookies()).get(HUB_COOKIE)?.value, ctx.userId, ctx.workspaceId);
    const backendRevoked = hub ? await disconnectHub(c, hub.session) : null;
    return setCookie(ok({ status: 'disconnected', backendRevoked }, { headers: NO_STORE }), '', 0);
  }

  return hubFail('INVALID_COMMAND', 400);
});
