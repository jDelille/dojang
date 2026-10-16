import { z } from 'zod';
import { prisma } from '@/lib/db';
import { created, fail, parseBody, withPublic } from '@/lib/api';
import { checkRateLimit, rateLimitHeaders, tooManyRequests } from '@/lib/rate-limit';
import { sendPush } from '@/lib/integrations/push';
import { randomToken } from '@/lib/crypto';

/**
 * Public review capture, posted by the /r/[slug] landing page.
 *
 * Unauthenticated by necessity — real customers land here from an SMS or email
 * link — so it is rate limited per IP and stores what it receives as an
 * internal review the owner then triages.
 */

const schema = z.object({
  workspaceSlug: z.string().min(1).max(80),
  rating: z.number().int().min(1).max(5),
  authorName: z.string().max(120).optional(),
  body: z.string().max(4000).optional(),
});

const RATE_LIMIT = { windowSeconds: 3600, max: 5 };

export const POST = withPublic(async (req) => {
  const body = await parseBody(req, schema);

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const verdict = await checkRateLimit({
    scope: 'review',
    key: `${body.workspaceSlug}:${ip}`,
    ...RATE_LIMIT,
  });
  if (!verdict.allowed) {
    return tooManyRequests('Too many submissions. Please try again later.', verdict);
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug: body.workspaceSlug },
    select: { id: true },
  });
  if (!workspace) return fail(404, 'Unknown business.');

  const review = await prisma.review.create({
    data: {
      workspaceId: workspace.id,
      source: 'direct',
      externalId: randomToken(12),
      authorName: body.authorName?.trim() || null,
      rating: body.rating,
      body: body.body?.trim() || '(no written feedback)',
      status: 'new',
    },
    select: { id: true, rating: true },
  });

  // A low score is a service recovery opportunity — tell the team now.
  if (review.rating <= 3) {
    await sendPush(workspace.id, {
      title: `${review.rating}-star feedback just came in`,
      body: body.body?.slice(0, 100) || 'A customer left a low rating.',
      url: '/dashboard/reviews',
    }).catch(() => undefined);
  }

  // The headers ride on the success response too, so an integrator can see the
  // budget running down instead of only finding out when they are refused.
  return created({ ok: true }, { headers: rateLimitHeaders(verdict) });
});
