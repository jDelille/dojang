import { prisma } from '@/lib/db';
import { created, ok, parseBody, withWorkspace } from '@/lib/api';
import { agentCreateSchema } from '@/lib/validation';
import { MODEL_CATALOG } from '@/lib/ai/adapter';

export const GET = withWorkspace(async (ctx) => {
  const agents = await prisma.aiAgent.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: { _count: { select: { conversations: true, knowledgeDocs: true } } },
  });

  return ok({ agents, models: MODEL_CATALOG });
}, 'leads:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, agentCreateSchema);

  // Exactly one default agent per workspace — it's the one the widget and
  // inbound channels fall back to.
  if (body.isDefault) {
    await prisma.aiAgent.updateMany({
      where: { workspaceId: ctx.workspaceId },
      data: { isDefault: false },
    });
  }

  const isFirst = (await prisma.aiAgent.count({ where: { workspaceId: ctx.workspaceId } })) === 0;

  const agent = await prisma.aiAgent.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: body.name,
      provider: body.provider,
      model: body.model,
      personaPrompt: body.personaPrompt,
      greeting: body.greeting ?? null,
      tone: body.tone ?? 'professional',
      channels: body.channels ?? ['chat'],
      maxTokens: body.maxTokens ?? 2048,
      temperature: body.temperature ?? null,
      isActive: body.isActive ?? true,
      isDefault: body.isDefault ?? isFirst,
      escalationRules: (body.escalationRules ?? {}) as never,
    },
  });

  return created({ agent });
}, 'agents:write');
