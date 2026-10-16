import { NextResponse } from 'next/server';

/**
 * The one error format for /api/v2:
 *   { error: { code, status, retry, correlationId } }
 * `code` is a stable machine code (Odoo's hub codes pass through unchanged);
 * the UI turns it into words with `explainHubError`. `retry` tells the client
 * what is safe:
 *   'same_key'  — the outcome is unknown; retry with the SAME idempotencyKey
 *   'reconnect' — the Odoo sign-in expired; nothing ran
 *   null        — do not retry as is
 */
export type Retry = 'same_key' | 'reconnect' | null;

export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const SAME_KEY = new Set(['BACKEND_UNAVAILABLE_RETRY_SAME_ACTION', 'CONCURRENT_RETRY']);

export function retryFor(code: string): Retry {
  if (SAME_KEY.has(code)) return 'same_key';
  if (code === 'SIGN_IN_REQUIRED') return 'reconnect';
  return null;
}

export const NO_STORE = { 'cache-control': 'private, no-store' };

/** A successful /api/v2 response: never cached, tagged with the correlation id. */
export function respond(data: unknown, correlationId: string, status = 200) {
  return NextResponse.json(data, { status, headers: { ...NO_STORE, 'x-correlation-id': correlationId } });
}

export function problem(code: string, status: number, correlationId: string) {
  return NextResponse.json(
    { error: { code, status, retry: retryFor(code), correlationId } },
    { status, headers: { ...NO_STORE, 'x-correlation-id': correlationId } },
  );
}
