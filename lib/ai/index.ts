import { prisma } from '@/lib/db';
import { getCredentials } from '@/lib/credentials';
import { recordAiUsage } from '@/lib/usage';
import { ClaudeAdapter } from '@/lib/ai/providers/claude';
import { OpenAiAdapter } from '@/lib/ai/providers/openai';
import {
  DEFAULT_MODEL,
  type AiProviderAdapter,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
  type StreamChunk,
} from '@/lib/ai/adapter';
import { buildSystemPrompt, type AgentWithContext } from '@/lib/ai/prompt';
import type { AiProvider } from '@prisma/client';

export * from '@/lib/ai/adapter';
export { buildSystemPrompt } from '@/lib/ai/prompt';

/** Instantiates the adapter a workspace has configured for a given provider. */
export async function getAdapter(
  workspaceId: string,
  provider: AiProvider,
): Promise<AiProviderAdapter> {
  if (provider === 'openai') {
    const { apiKey } = await getCredentials(workspaceId, 'openai');
    return new OpenAiAdapter(apiKey);
  }
  const { apiKey } = await getCredentials(workspaceId, 'anthropic');
  return new ClaudeAdapter(apiKey);
}

/** Loads an agent plus everything the system prompt needs. */
export async function loadAgentContext(
  workspaceId: string,
  agentId?: string | null,
): Promise<AgentWithContext | null> {
  const agent = agentId
    ? await prisma.aiAgent.findFirst({ where: { id: agentId, workspaceId } })
    : await prisma.aiAgent.findFirst({
        where: { workspaceId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });

  if (!agent) return null;

  const [workspace, knowledgeDocs] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    prisma.knowledgeDoc.findMany({
      where: {
        workspaceId,
        isActive: true,
        OR: [{ agentId: agent.id }, { agentId: null }],
      },
      orderBy: { createdAt: 'asc' },
      take: 40,
    }),
  ]);

  return { agent, workspace, knowledgeDocs };
}

export type AgentReplyOptions = {
  workspaceId: string;
  agentId?: string | null;
  history: ChatMessage[];
  contactName?: string | null;
  channel?: string;
  effort?: ChatRequest['effort'];
};

/** Non-streaming reply — used by SMS, voice and the retention engine. */
export async function generateAgentReply(
  options: AgentReplyOptions,
): Promise<ChatResult & { agentId: string; escalate: boolean }> {
  const ctx = await loadAgentContext(options.workspaceId, options.agentId);
  if (!ctx) throw new Error('No active AI agent configured for this workspace.');

  const adapter = await getAdapter(options.workspaceId, ctx.agent.provider);
  const system = buildSystemPrompt(ctx, {
    contactName: options.contactName,
    channel: options.channel,
  });

  const result = await adapter.complete({
    system,
    messages: options.history,
    model: ctx.agent.model || DEFAULT_MODEL[ctx.agent.provider],
    maxTokens: ctx.agent.maxTokens,
    temperature: ctx.agent.temperature ?? undefined,
    effort: options.effort ?? 'low',
  });

  await recordAiUsage(options.workspaceId, result.usage.inputTokens, result.usage.outputTokens);

  return {
    ...result,
    agentId: ctx.agent.id,
    escalate: shouldEscalate(ctx, options.history, result.text),
  };
}

/** Streaming reply — used by the chat widget and the inbox composer. */
export async function* streamAgentReply(
  options: AgentReplyOptions,
): AsyncGenerator<StreamChunk & { agentId?: string }> {
  const ctx = await loadAgentContext(options.workspaceId, options.agentId);
  if (!ctx) {
    yield { type: 'error', message: 'No active AI agent configured for this workspace.' };
    return;
  }

  let adapter: AiProviderAdapter;
  try {
    adapter = await getAdapter(options.workspaceId, ctx.agent.provider);
  } catch (error) {
    yield { type: 'error', message: (error as Error).message };
    return;
  }

  const system = buildSystemPrompt(ctx, {
    contactName: options.contactName,
    channel: options.channel,
  });

  for await (const chunk of adapter.stream({
    system,
    messages: options.history,
    model: ctx.agent.model || DEFAULT_MODEL[ctx.agent.provider],
    maxTokens: ctx.agent.maxTokens,
    temperature: ctx.agent.temperature ?? undefined,
    effort: options.effort ?? 'low',
  })) {
    if (chunk.type === 'done') {
      await recordAiUsage(
        options.workspaceId,
        chunk.usage.inputTokens,
        chunk.usage.outputTokens,
      );
    }
    yield { ...chunk, agentId: ctx.agent.id };
  }
}

/**
 * Escalation rules (spec §4.1) — when to hand off to a human.
 * Configured per agent as { keywords: string[], afterTurns: number }.
 */
export function shouldEscalate(
  ctx: AgentWithContext,
  history: ChatMessage[],
  reply: string,
): boolean {
  const rules = (ctx.agent.escalationRules ?? {}) as {
    keywords?: string[];
    afterTurns?: number;
  };

  const keywords = (rules.keywords ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean);
  if (keywords.length) {
    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
    const haystack = `${lastUser}\n${reply}`.toLowerCase();
    if (keywords.some((k) => haystack.includes(k))) return true;
  }

  if (rules.afterTurns && rules.afterTurns > 0) {
    const turns = history.filter((m) => m.role === 'user').length;
    if (turns >= rules.afterTurns) return true;
  }

  // The agent asking for a human counts as an escalation regardless of config.
  return /\b(human|team member|representative)\s+(will|can)\s+(reach|get back|follow up)/i.test(
    reply,
  );
}

/** One-off helper for summaries, review drafts, and call transcription summaries. */
export async function runUtilityPrompt(
  workspaceId: string,
  system: string,
  prompt: string,
  opts: { provider?: AiProvider; maxTokens?: number; effort?: ChatRequest['effort'] } = {},
): Promise<string> {
  const provider: AiProvider =
    opts.provider ??
    (await prisma.aiAgent
      .findFirst({
        where: { workspaceId, isActive: true },
        orderBy: { isDefault: 'desc' },
        select: { provider: true },
      })
      .then((a) => a?.provider ?? 'claude'));

  const adapter = await getAdapter(workspaceId, provider);
  const result = await adapter.complete({
    system,
    messages: [{ role: 'user', content: prompt }],
    model: DEFAULT_MODEL[provider],
    maxTokens: opts.maxTokens ?? 1024,
    effort: opts.effort ?? 'medium',
  });

  await recordAiUsage(workspaceId, result.usage.inputTokens, result.usage.outputTokens);
  return result.text;
}
