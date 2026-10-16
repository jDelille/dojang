import { prisma } from '@/lib/db';
import { fail, parseBody, routeParam, withWorkspace } from '@/lib/api';
import { agentChatSchema } from '@/lib/validation';
import { streamAgentReply } from '@/lib/ai';
import type { ChatMessage } from '@/lib/ai/adapter';

/**
 * POST /api/agents/[id]/chat — streams the agent's reply as Server-Sent
 * Events (spec §6). Used by the agent test console and the inbox composer.
 *
 * The message is persisted before streaming starts, and the reply is written
 * once the stream completes, so a dropped connection can't lose the turn.
 */

export const POST = withWorkspace(async (ctx, req, params) => {
  const agentId = await routeParam(params, 'id');
  const body = await parseBody(req, agentChatSchema);

  const agent = await prisma.aiAgent.findFirst({
    where: { id: agentId, workspaceId: ctx.workspaceId },
    select: { id: true, isActive: true },
  });
  if (!agent) return fail(404, 'Agent not found.');
  if (!agent.isActive) return fail(409, 'That agent is paused. Activate it before chatting.');

  const channel = body.channel ?? 'chat';

  // Reuse the conversation when one is supplied; otherwise open a new thread.
  let conversation = body.conversationId
    ? await prisma.conversation.findFirst({
        where: { id: body.conversationId, workspaceId: ctx.workspaceId },
        include: { contact: { select: { name: true } } },
      })
    : null;

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId: ctx.workspaceId,
        contactId: body.contactId ?? null,
        agentId: agent.id,
        channel,
        subject: 'Agent test',
      },
      include: { contact: { select: { name: true } } },
    });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'in',
      sender: 'human',
      body: body.message,
    },
  });

  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 40,
    select: { direction: true, body: true },
  });

  const chatHistory: ChatMessage[] = history.map((m) => ({
    role: m.direction === 'in' ? 'user' : 'assistant',
    content: m.body,
  }));

  const conversationId = conversation.id;
  const contactName = conversation.contact?.name ?? null;
  const workspaceId = ctx.workspaceId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // The reader is gone the moment the tab closes. Enqueueing then throws,
      // which would abort the loop below before the provider's final `done`
      // chunk — losing the reply the buyer has already been charged for and
      // under-counting their metered tokens. Swallow it and keep going.
      let clientGone = false;
      const send = (event: string, data: unknown) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          clientGone = true;
        }
      };

      send('meta', { conversationId, agentId: agent.id });

      let full = '';
      let tokensIn = 0;
      let tokensOut = 0;

      try {
        for await (const chunk of streamAgentReply({
          workspaceId,
          agentId: agent.id,
          history: chatHistory,
          contactName,
          channel,
        })) {
          if (chunk.type === 'text') {
            full += chunk.text;
            send('token', { text: chunk.text });
          }
          if (chunk.type === 'done') {
            tokensIn = chunk.usage.inputTokens;
            tokensOut = chunk.usage.outputTokens;
          }
          if (chunk.type === 'error') {
            send('error', { message: chunk.message });
          }
        }

        send('done', { conversationId, tokensIn, tokensOut });
      } catch (error) {
        send('error', { message: (error as Error).message });
      } finally {
        // Persist in `finally` so a reply that was generated still lands in
        // the conversation even when the reader disconnected mid-stream.
        if (full.trim()) {
          await prisma.message
            .create({
              data: {
                conversationId,
                direction: 'out',
                sender: 'ai',
                body: full,
                tokensIn,
                tokensOut,
              },
            })
            .then(() =>
              prisma.conversation.update({
                where: { id: conversationId },
                data: { lastMessageAt: new Date() },
              }),
            )
            .catch(() => {
              // Nothing useful to tell a reader who has already gone.
            });
        }

        try {
          controller.close();
        } catch {
          // Already closed by the disconnect.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}, 'inbox:write');
