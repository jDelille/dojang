import { z, type ZodTypeAny } from 'zod';
import { DomainError } from './errors';

/**
 * The one mutation envelope for /api/v2 writes:
 *   { idempotencyKey, correlationId?, expectedVersion?, payload }
 * The client makes one idempotencyKey per intended action and reuses it when
 * retrying that action, so a retry can never act twice. expectedVersion is the
 * record version the user was looking at; Odoo refuses the write if it moved.
 */
export const idempotencyKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{15,127}$/);

export const recordId = z.string().regex(/^[1-9][0-9]{0,9}$/);

export function envelope<P extends ZodTypeAny>(payload: P) {
  return z
    .object({
      idempotencyKey,
      correlationId: z.string().uuid().optional(),
      expectedVersion: z.number().int().min(0).optional(),
      payload,
    })
    .strict();
}

/** Reads and validates a JSON body; any problem is INVALID_COMMAND. */
export async function readEnvelope<S extends ZodTypeAny>(req: Request, schema: S, maxBytes = 16_384): Promise<z.infer<S>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new DomainError('INVALID_COMMAND', 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DomainError('INVALID_COMMAND', 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new DomainError('INVALID_COMMAND', 400);
  return parsed.data;
}

/** A route param that must be an Odoo record id. */
export async function idParam(params: unknown, key: string): Promise<string> {
  const resolved = (await ((params as { params?: unknown })?.params ?? params)) as Record<string, unknown> | undefined;
  const parsed = recordId.safeParse(resolved?.[key]);
  if (!parsed.success) throw new DomainError('INVALID_COMMAND', 400);
  return parsed.data;
}
