import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ZodError, type ZodSchema } from 'zod';
import { authOptions } from '@/lib/auth';
import { can, type Permission } from '@/lib/rbac';
import type { Role } from '@prisma/client';

/**
 * Route-handler plumbing. Every tenant-scoped endpoint goes through
 * `withWorkspace`, which is the single place workspace isolation is enforced
 * (spec §9 Multi-tenancy) — handlers receive a workspaceId they cannot widen.
 */

export type ApiContext = {
  userId: string;
  email: string;
  role: Role;
  workspaceId: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function created<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function fail(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function handleError(error: unknown) {
  if (error instanceof ApiError) {
    return fail(error.status, error.message, error.details);
  }
  if (error instanceof ZodError) {
    return fail(422, 'Validation failed', error.flatten());
  }
  console.error('[api]', error);
  const message = error instanceof Error ? error.message : 'Internal server error';
  return fail(500, process.env.NODE_ENV === 'development' ? message : 'Internal server error');
}

/** Wraps a handler that only needs an authenticated user (no workspace). */
export function withAuth(
  handler: (ctx: Omit<ApiContext, 'workspaceId'> & { workspaceId: string | null }, req: Request, params: any) => Promise<Response>,
) {
  return async (req: Request, params: any): Promise<Response> => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) return fail(401, 'Not authenticated');

      return await handler(
        {
          userId: session.user.id,
          email: session.user.email,
          role: session.user.role,
          workspaceId: session.user.workspaceId,
        },
        req,
        params,
      );
    } catch (error) {
      return handleError(error);
    }
  };
}

/**
 * Wraps a handler that operates inside a workspace. Optionally requires a
 * permission; a caller without it gets a 403 before the handler runs.
 */
export function withWorkspace(
  handler: (ctx: ApiContext, req: Request, params: any) => Promise<Response>,
  permission?: Permission,
) {
  return async (req: Request, params: any): Promise<Response> => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) return fail(401, 'Not authenticated');

      const workspaceId = session.user.workspaceId;
      if (!workspaceId) {
        return fail(409, 'No workspace selected. Complete onboarding first.');
      }

      if (permission && !can(session.user.role, permission)) {
        return fail(403, `Your role (${session.user.role}) cannot perform this action.`);
      }

      return await handler(
        {
          userId: session.user.id,
          email: session.user.email,
          role: session.user.role,
          workspaceId,
        },
        req,
        params,
      );
    } catch (error) {
      return handleError(error);
    }
  };
}

/** Public/webhook handler — no session, but errors are still normalized. */
export function withPublic(handler: (req: Request, params: any) => Promise<Response>) {
  return async (req: Request, params: any): Promise<Response> => {
    try {
      return await handler(req, params);
    } catch (error) {
      return handleError(error);
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, 'Expected a JSON body.');
  }
  return schema.parse(raw);
}

export function searchParams(req: Request) {
  return new URL(req.url).searchParams;
}

export function paginationFrom(req: Request, defaultTake = 50) {
  const sp = searchParams(req);
  const take = Math.min(Math.max(Number(sp.get('limit') ?? defaultTake) || defaultTake, 1), 200);
  const page = Math.max(Number(sp.get('page') ?? 1) || 1, 1);
  return { take, skip: (page - 1) * take, page };
}

/** Resolves the `[id]` style dynamic segment, awaiting Next 15's async params. */
export async function routeParam(params: any, key: string): Promise<string> {
  const resolved = await (params?.params ?? params);
  const value = resolved?.[key];
  if (typeof value !== 'string') throw new ApiError(400, `Missing route parameter "${key}".`);
  return value;
}
