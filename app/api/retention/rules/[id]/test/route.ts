import { prisma } from '@/lib/db';
import { fail, ok, routeParam, withWorkspace } from '@/lib/api';
import { describeStep, executeStep, findMatchingContacts, formatDelay, parseSteps } from '@/lib/retention';

/**
 * POST /api/retention/rules/[id]/test — dry-run a rule (spec §6).
 *
 * Nothing is sent. The response shows which contacts currently match and
 * exactly what each step would do to the first of them, with variables
 * already substituted so the buyer can proof the copy.
 */
export const POST = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const rule = await prisma.retentionRule.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
  });
  if (!rule) return fail(404, 'Rule not found.');

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
  });

  const steps = parseSteps(rule.steps);
  if (!steps.length) return fail(400, 'This rule has no steps yet.');

  const matches = await findMatchingContacts(rule);
  const sample = matches[0] ?? null;

  // Preview against a real contact when there is one, otherwise a stand-in so
  // the buyer can still see the rendered copy.
  const previewContact =
    sample ??
    ({
      id: 'preview',
      workspaceId: ctx.workspaceId,
      name: 'Sample Customer',
      email: 'sample@example.com',
      phone: '+15550100',
      company: 'Sample Co.',
      tags: [],
      optedOutSms: false,
      optedOutEmail: false,
    } as never);

  const preview = [];
  let cumulativeMinutes = 0;

  for (const [index, step] of steps.entries()) {
    cumulativeMinutes += step.delayMinutes ?? 0;

    const result = await executeStep(step, {
      workspace,
      contact: previewContact,
      rule,
      dryRun: true,
    });

    preview.push({
      index,
      action: step.action,
      runsAfter: cumulativeMinutes ? formatDelay(cumulativeMinutes) : 'immediately',
      summary: describeStep(step, { workspace, contact: previewContact, rule, dryRun: true }),
      detail: result.detail,
      status: result.status,
    });
  }

  return ok({
    matchedContacts: matches.length,
    sampleContact: sample ? { id: sample.id, name: sample.name, email: sample.email } : null,
    usingPlaceholder: !sample,
    preview,
  });
}, 'retention:write');
