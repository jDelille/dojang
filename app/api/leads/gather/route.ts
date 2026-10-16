import { prisma } from '@/lib/db';
import { created, fail, ok, parseBody, withWorkspace } from '@/lib/api';
import { leadGatherSchema } from '@/lib/validation';
import { enqueueLeadGather } from '@/lib/queue';
import { getCredentials } from '@/lib/credentials';

/**
 * POST /api/leads/gather — enqueues a Google Maps lead-gen job (spec §6.2).
 * The HTTP request only creates the job row and queues it; all the Places API
 * work happens in workers/leadGather.ts.
 */

export const GET = withWorkspace(async (ctx) => {
  const jobs = await prisma.leadGatherJob.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return ok({ jobs });
}, 'leads:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, leadGatherSchema);

  const { apiKey } = await getCredentials(ctx.workspaceId, 'google_maps');
  if (!apiKey) {
    return fail(
      400,
      'Add a Google Maps API key in Settings → Integrations before gathering leads.',
    );
  }

  // One running job at a time per workspace keeps Places quota predictable.
  const running = await prisma.leadGatherJob.findFirst({
    where: { workspaceId: ctx.workspaceId, status: { in: ['queued', 'running'] } },
    select: { id: true },
  });
  if (running) {
    return fail(409, 'A lead gathering job is already running for this workspace.');
  }

  const job = await prisma.leadGatherJob.create({
    data: {
      workspaceId: ctx.workspaceId,
      countries: body.countries,
      niche: body.niche,
      targetCount: body.targetCount,
      status: 'queued',
    },
  });

  try {
    await enqueueLeadGather({
      jobId: job.id,
      workspaceId: ctx.workspaceId,
      countries: job.countries,
      niche: job.niche,
      // Read back from the row so the queued job and the record can't disagree.
      targetCount: job.targetCount,
    });
  } catch (error) {
    await prisma.leadGatherJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: `Could not queue the job: ${(error as Error).message}` },
    });
    return fail(
      503,
      // Report what actually broke. This previously always blamed Redis, which
      // sent debugging in the wrong direction when the real fault was a
      // malformed job id that BullMQ rejected outright.
      `Could not queue the job: ${(error as Error).message}. ` +
        'If this mentions a connection, check REDIS_URL and that the worker is running.',
    );
  }

  return created({ job });
}, 'leads:gather');
