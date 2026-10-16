import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/queue';

/**
 * Fixed-window rate limiting for the public endpoints, with the response
 * headers an integrator needs to behave well.
 *
 * A bare 429 with no headers leaves a caller guessing how long to wait, so the
 * usual result is a tight retry loop that makes the overload worse. Every
 * limited response here carries `Retry-After` and the `X-RateLimit-*` triple,
 * and successful responses carry the same triple so a client can slow down
 * *before* it is refused.
 *
 * Redis-backed, and it fails open: a Redis blip must not take a buyer's chat
 * widget or review form offline.
 */

export interface RateLimitRule {
  /** Identifies the bucket in Redis, e.g. 'widget:ip'. */
  scope: string;
  /** The caller being counted — an IP, a session id, a workspace slug. */
  key: string;
  windowSeconds: number;
  max: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds when the current window rolls over. */
  resetAt: number;
  retryAfter: number;
}

export async function checkRateLimit(rule: RateLimitRule): Promise<RateLimitVerdict> {
  const now = Math.floor(Date.now() / 1000);
  const fallback: RateLimitVerdict = {
    allowed: true,
    limit: rule.max,
    remaining: rule.max,
    resetAt: now + rule.windowSeconds,
    retryAfter: 0,
  };

  try {
    const redis = getRedis();
    const redisKey = `roster:rl:${rule.scope}:${rule.key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, rule.windowSeconds);

    // A key with no TTL would count forever after an expire that never landed.
    let ttl = await redis.ttl(redisKey);
    if (ttl < 0) {
      await redis.expire(redisKey, rule.windowSeconds);
      ttl = rule.windowSeconds;
    }

    const allowed = count <= rule.max;
    return {
      allowed,
      limit: rule.max,
      remaining: Math.max(0, rule.max - count),
      resetAt: now + ttl,
      retryAfter: allowed ? 0 : ttl,
    };
  } catch {
    return fallback;
  }
}

/** Applies the strictest of several rules — the first refusal wins. */
export async function checkRateLimits(rules: RateLimitRule[]): Promise<RateLimitVerdict> {
  let strictest: RateLimitVerdict | null = null;
  for (const rule of rules) {
    const verdict = await checkRateLimit(rule);
    if (!verdict.allowed) return verdict;
    if (!strictest || verdict.remaining < strictest.remaining) strictest = verdict;
  }
  return strictest ?? { allowed: true, limit: 0, remaining: 0, resetAt: 0, retryAfter: 0 };
}

export function rateLimitHeaders(verdict: RateLimitVerdict): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(verdict.limit),
    'X-RateLimit-Remaining': String(verdict.remaining),
    'X-RateLimit-Reset': String(verdict.resetAt),
  };
  if (!verdict.allowed) headers['Retry-After'] = String(Math.max(1, verdict.retryAfter));
  return headers;
}

/** The 429 itself, with everything a caller needs to back off correctly. */
export function tooManyRequests(message: string, verdict: RateLimitVerdict) {
  return NextResponse.json({ error: message }, { status: 429, headers: rateLimitHeaders(verdict) });
}
