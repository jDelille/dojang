import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { fail, ok, withWorkspace } from '@/lib/api';
import {
  HUB_COOKIE,
  HUB_COOKIE_MAX_AGE,
  HubError,
  connectHub,
  disconnectHub,
  hubConfig,
  isLargeHubOperation,
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

/** A browser on another site must not be able to drive this staff member's Odoo session. */
function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * GET /api/hub — whether this staff member's Odoo account is connected and,
 * if so, Odoo's hub context for them (their Odoo user, role and site).
 */
export const GET = withWorkspace(async (ctx) => {
  const c = hubConfig();
  if (!c) return ok({ status: 'notConfigured' }, { headers: NO_STORE });
  const session = openSession(c, (await cookies()).get(HUB_COOKIE)?.value, ctx.userId, ctx.workspaceId);
  if (!session) return ok({ status: 'disconnected' }, { headers: NO_STORE });
  try {
    const context = await runHub(c, session, 'context', {}, undefined);
    return ok({ status: 'connected', context }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof HubError && error.status === 401) {
      return setCookie(ok({ status: 'disconnected' }, { headers: NO_STORE }), '', 0);
    }
    return ok({ status: 'offline' }, { headers: NO_STORE });
  }
});

/**
 * POST /api/hub
 *   { operation: 'connect', login, password } — sign in to Odoo as yourself
 *   { operation: 'disconnect' }
 *   { operation, payload, requestKey }        — one hub operation (writes need a requestKey;
 *                                               retry an unconfirmed write with the same key)
 */
export const POST = withWorkspace(async (ctx, req) => {
  if (!sameOrigin(req)) return fail(403, 'Forbidden');
  const c = hubConfig();
  if (!c) return hubFail('HUB_NOT_CONFIGURED', 503);

  const text = await req.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return hubFail('INVALID_COMMAND', 400);
  }
  if (!isObject(data) || typeof data.operation !== 'string') return hubFail('INVALID_COMMAND', 400);
  const operation = data.operation;
  if (text.length > (isLargeHubOperation(operation) ? 450_000 : 16_384)) return hubFail('INVALID_COMMAND', 413);

  if (operation === 'connect') {
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
      const { session, context } = await connectHub(c, login.trim(), password);
      return setCookie(
        ok({ status: 'connected', context }, { headers: NO_STORE }),
        sealSession(c, session, ctx.userId, ctx.workspaceId),
        HUB_COOKIE_MAX_AGE,
      );
    } catch (error) {
      if (error instanceof HubError) return hubFail(error.code, error.status);
      throw error;
    }
  }

  const session = openSession(c, (await cookies()).get(HUB_COOKIE)?.value, ctx.userId, ctx.workspaceId);

  if (operation === 'disconnect') {
    const backendRevoked = session ? await disconnectHub(c, session) : null;
    return setCookie(ok({ status: 'disconnected', backendRevoked }, { headers: NO_STORE }), '', 0);
  }

  if (!session) return hubFail('SIGN_IN_REQUIRED', 401);
  if (!isObject(data.payload) || (data.requestKey !== undefined && typeof data.requestKey !== 'string')) {
    return hubFail('INVALID_COMMAND', 400);
  }
  try {
    const result = await runHub(c, session, operation, data.payload, data.requestKey as string | undefined);
    return ok(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof HubError) {
      const res = hubFail(error.code, error.status);
      return error.code === 'SIGN_IN_REQUIRED' ? setCookie(res, '', 0) : res;
    }
    throw error;
  }
});
