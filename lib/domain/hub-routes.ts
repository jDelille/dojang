import 'server-only';
import { z } from 'zod';
import { isLargeHubOperation } from '@/lib/odoo-hub';
import type { Capability } from './capabilities';
import { withStaff } from './context';
import { envelope, readEnvelope } from './envelope';
import { DomainError, respond } from './errors';

/**
 * Builders for /api/v2 routes that map one-to-one onto a hub operation of
 * Jodi's Odoo addon. The route is named for the business action; the hub
 * operation name never comes from the request, so a caller can only run the
 * one operation that route exists for. Odoo validates the payload and checks
 * the staff member's grant and record scope on every call.
 */

/** Photos and signed waivers carry an image, so they get Jodi's larger limit. */
const LARGE_BODY_BYTES = 450_000;
const BODY_BYTES = 16_384;

const Payload = z.record(z.string(), z.unknown());
const Write = envelope(Payload);
const Preview = z.object({ payload: Payload }).strict();

/** Route params (for example `{ id }`) renamed to the hub's payload keys. */
type ParamMap = Record<string, string>;

async function paramsToPayload(params: unknown, map: ParamMap | undefined) {
  if (!map) return {};
  const resolved = (await ((params as { params?: unknown })?.params ?? params)) as Record<string, unknown> | undefined;
  const payload: Record<string, unknown> = {};
  for (const [routeKey, hubKey] of Object.entries(map)) {
    const value = resolved?.[routeKey];
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,9}$/.test(value)) throw new DomainError('INVALID_COMMAND', 400);
    payload[hubKey] = value;
  }
  return payload;
}

/**
 * GET: a hub read. Query parameters are passed as string payload fields
 * (for example `?query=sam`), and route params are added by `map`.
 */
export function hubRead(operation: string, capability: Capability, map?: ParamMap) {
  return withStaff(async (ctx, req, params) => {
    const query = Object.fromEntries(new URL(req.url).searchParams);
    for (const value of Object.values(query)) {
      if (value.length > 200) throw new DomainError('INVALID_COMMAND', 400);
    }
    const payload = { ...query, ...(await paramsToPayload(params, map)) };
    return respond(await ctx.read(operation, payload), ctx.correlationId);
  }, capability);
}

/**
 * POST `{ payload }`: a hub read that needs a structured payload, such as a
 * preview of a write the user is about to review. Nothing is saved.
 */
export function hubPreview(operation: string, capability: Capability, map?: ParamMap) {
  return withStaff(async (ctx, req, params) => {
    const body = await readEnvelope(req, Preview, BODY_BYTES);
    const payload = { ...body.payload, ...(await paramsToPayload(params, map)) };
    return respond(await ctx.read(operation, payload), ctx.correlationId);
  }, capability);
}

/**
 * POST `{ idempotencyKey, expectedVersion?, payload }`: a hub write. A retry
 * of the same action must send the same idempotencyKey; Odoo then replays the
 * saved result instead of acting twice.
 */
export function hubWrite(operation: string, capability: Capability, map?: ParamMap) {
  return withStaff(async (ctx, req, params) => {
    const maxBytes = isLargeHubOperation(operation) ? LARGE_BODY_BYTES : BODY_BYTES;
    const body = await readEnvelope(req, Write, maxBytes);
    const payload: Record<string, unknown> = { ...body.payload, ...(await paramsToPayload(params, map)) };
    if (body.expectedVersion !== undefined) payload.expectedVersion = body.expectedVersion;
    return respond(await ctx.write(operation, payload, body.idempotencyKey), ctx.correlationId);
  }, capability);
}
