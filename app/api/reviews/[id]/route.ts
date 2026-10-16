import { prisma } from '@/lib/db';
import { fail, ok, parseBody, routeParam, searchParams, withWorkspace } from '@/lib/api';
import { reviewUpdateSchema } from '@/lib/validation';
import { runUtilityPrompt } from '@/lib/ai';
import { UTILITY_PROMPTS } from '@/lib/ai/prompt';

/**
 * Review response workflow (spec §4.6): the AI drafts, the buyer approves or
 * edits, then it's marked as posted. Roster never posts on the buyer's behalf
 * without an explicit approval step.
 */

export const PATCH = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const body = await parseBody(req, reviewUpdateSchema);

  const existing = await prisma.review.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!existing) return fail(404, 'Review not found.');

  const review = await prisma.review.update({
    where: { id },
    data: {
      ...body,
      reviewedAt: body.status === 'responded' ? new Date() : undefined,
    },
  });

  return ok({ review });
}, 'reviews:write');

/** POST ?action=draft — (re)generate the AI response draft. */
export const POST = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const action = searchParams(req).get('action') ?? 'draft';

  const review = await prisma.review.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
  });
  if (!review) return fail(404, 'Review not found.');
  if (action !== 'draft') return fail(400, 'Unsupported action.');

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { businessName: true, name: true },
  });

  const prompt = [
    `Business: ${workspace.businessName || workspace.name}`,
    `Rating: ${review.rating} out of 5`,
    `Reviewer: ${review.authorName ?? 'Anonymous'}`,
    `Review: ${review.body}`,
    '',
    'Write the business owner\'s public reply.',
  ].join('\n');

  try {
    const draft = await runUtilityPrompt(
      ctx.workspaceId,
      UTILITY_PROMPTS.reviewResponse,
      prompt,
      { maxTokens: 400, effort: 'medium' },
    );

    const updated = await prisma.review.update({
      where: { id },
      data: { aiResponseDraft: draft.trim(), status: 'drafted' },
    });

    return ok({ review: updated });
  } catch (error) {
    return fail(502, `Could not draft a reply: ${(error as Error).message}`);
  }
}, 'reviews:write');
