import { prisma } from '@/lib/db';
import { fail, ok, withWorkspace } from '@/lib/api';
import { getCredentials } from '@/lib/credentials';

/**
 * Pulls the Google review feed for monitoring (spec §4.6).
 *
 * Google Places returns up to five of the most relevant reviews per place —
 * that is the documented ceiling of the Places API, not a limitation here.
 * Businesses needing the full history connect Google Business Profile, which
 * requires their own OAuth app; that is outside the scope of a self-hosted
 * script, so this endpoint is the monitoring feed.
 */
export const POST = withWorkspace(async (ctx) => {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { businessName: true, name: true, businessAddress: true },
  });

  const { apiKey } = await getCredentials(ctx.workspaceId, 'google_maps');
  if (!apiKey) {
    return fail(400, 'Add a Google Maps API key in Settings → Integrations to pull reviews.');
  }

  const query = [workspace.businessName || workspace.name, workspace.businessAddress]
    .filter(Boolean)
    .join(' ');

  try {
    // 1. Find the business's own place id.
    const searchParamsUrl = new URLSearchParams({
      key: apiKey,
      input: query,
      inputtype: 'textquery',
      fields: 'place_id,name',
    });
    const search = (await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${searchParamsUrl}`,
      { cache: 'no-store' },
    ).then((r) => r.json())) as { candidates?: { place_id: string }[]; status: string };

    const placeId = search.candidates?.[0]?.place_id;
    if (!placeId) {
      return fail(
        404,
        'Could not find this business on Google Maps. Check the business name and address in Settings.',
      );
    }

    // 2. Pull its reviews.
    const detailsParams = new URLSearchParams({
      key: apiKey,
      place_id: placeId,
      fields: 'reviews,rating,user_ratings_total',
    });
    const details = (await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${detailsParams}`,
      { cache: 'no-store' },
    ).then((r) => r.json())) as {
      result?: {
        rating?: number;
        user_ratings_total?: number;
        reviews?: {
          author_name: string;
          rating: number;
          text: string;
          time: number;
          relative_time_description: string;
        }[];
      };
      status: string;
    };

    const incoming = details.result?.reviews ?? [];
    let imported = 0;

    for (const review of incoming) {
      const externalId = `${placeId}:${review.time}`;

      const existing = await prisma.review.findUnique({
        where: {
          workspaceId_source_externalId: {
            workspaceId: ctx.workspaceId,
            source: 'google',
            externalId,
          },
        },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.review.create({
        data: {
          workspaceId: ctx.workspaceId,
          source: 'google',
          externalId,
          authorName: review.author_name,
          rating: review.rating,
          body: review.text || '(no written review)',
          status: 'new',
          createdAt: new Date(review.time * 1000),
        },
      });
      imported += 1;
    }

    return ok({
      imported,
      seen: incoming.length,
      averageRating: details.result?.rating ?? null,
      totalOnGoogle: details.result?.user_ratings_total ?? null,
      note:
        incoming.length >= 5
          ? 'Google Places returns at most 5 reviews per request — this is the most recent set, not the full history.'
          : undefined,
    });
  } catch (error) {
    return fail(502, `Could not reach Google: ${(error as Error).message}`);
  }
}, 'reviews:write');
