import { Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { createRedisConnection, QUEUE_NAMES, type LeadGatherJobData } from '@/lib/queue';
import { gatherPlaces, getMapsApiKey, GoogleMapsError } from '@/lib/integrations/googleMaps';
import { recordUsage } from '@/lib/usage';
import { normalizePhone } from '@/lib/utils';

/**
 * Google Maps lead-generation worker (spec §4.2 / §6.2).
 *
 * Deduplication happens on two keys, matching the spec:
 *   (workspace_id, google_place_id)  — enforced by a DB unique constraint
 *   (workspace_id, phone)            — checked here, since two Places entries
 *                                      for the same business (e.g. a listing
 *                                      and a service-area duplicate) share a
 *                                      phone number but not a place id.
 */

export function createLeadGatherWorker() {
  return new Worker<LeadGatherJobData>(
    QUEUE_NAMES.leadGather,
    async (job: Job<LeadGatherJobData>) => {
      const { jobId, workspaceId, countries, niche, targetCount } = job.data;

      await prisma.leadGatherJob.update({
        where: { id: jobId },
        data: { status: 'running', startedAt: new Date() },
      });

      try {
        const apiKey = await getMapsApiKey(workspaceId);

        const places = await gatherPlaces({
          apiKey,
          niche,
          regions: countries,
          targetCount,
          onProgress: async (found) => {
            await prisma.leadGatherJob
              .update({ where: { id: jobId }, data: { foundCount: found } })
              .catch(() => undefined);
            await job.updateProgress(Math.min((found / targetCount) * 100, 99));
          },
        });

        let saved = 0;
        let dupes = 0;

        for (const place of places) {
          const phone = normalizePhone(place.phone);

          // Phone-level dedupe (the place-id dedupe is the DB constraint below).
          if (phone) {
            const existingByPhone = await prisma.lead.findFirst({
              where: { workspaceId, phone },
              select: { id: true },
            });
            if (existingByPhone) {
              dupes += 1;
              continue;
            }
          }

          try {
            await prisma.lead.create({
              data: {
                workspaceId,
                gatherJobId: jobId,
                source: 'maps',
                businessName: place.businessName,
                phone,
                website: place.website,
                address: place.address,
                city: place.city,
                country: place.country,
                niche,
                category: place.category,
                rating: place.rating,
                reviewCount: place.reviewCount,
                googlePlaceId: place.googlePlaceId,
                status: 'new',
              },
            });
            saved += 1;
          } catch (error) {
            // P2002 = unique violation on (workspaceId, googlePlaceId).
            if ((error as { code?: string }).code === 'P2002') dupes += 1;
            else throw error;
          }
        }

        await prisma.leadGatherJob.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            foundCount: places.length,
            savedCount: saved,
            dupeCount: dupes,
            finishedAt: new Date(),
          },
        });

        await recordUsage(workspaceId, 'leads_gathered', saved);

        console.log(
          `[leadGather] ${jobId}: found ${places.length}, saved ${saved}, skipped ${dupes} duplicates`,
        );

        return { found: places.length, saved, dupes };
      } catch (error) {
        const message = (error as Error).message;

        await prisma.leadGatherJob.update({
          where: { id: jobId },
          data: { status: 'failed', error: message, finishedAt: new Date() },
        });

        // A bad API key or exhausted quota won't fix itself on retry.
        if (error instanceof GoogleMapsError) {
          console.error(`[leadGather] ${jobId} failed permanently: ${message}`);
          return { found: 0, saved: 0, dupes: 0, error: message };
        }

        throw error;
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 2, // Places API quota is the bottleneck, not CPU.
    },
  );
}
