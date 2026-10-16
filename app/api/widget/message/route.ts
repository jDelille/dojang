import { prisma } from '@/lib/db';
import { fail, parseBody, withPublic } from '@/lib/api';
import { widgetMessageSchema } from '@/lib/validation';
import { streamAgentReply } from '@/lib/ai';
import { upsertContact, logActivity } from '@/lib/workspace';
import { normalizePhone } from '@/lib/utils';
import { sendPush } from '@/lib/integrations/push';
import type { ChatMessage } from '@/lib/ai/adapter';
import {
  checkRateLimits,
  rateLimitHeaders,
  tooManyRequests,
  type RateLimitRule,
} from '@/lib/rate-limit';

/**
 * Public endpoint behind the website chat widget. Streams the agent's reply
 * as SSE, same shape as the authenticated agent chat route.
 *
 * This is the one route on the whole install that anyone on the internet can
 * make spend money — every message costs the buyer AI tokens — so it carries
 * three limits rather than one:
 *
 *  - per session, which keeps one honest visitor from spamming;
 *  - per IP, because the session id comes from the *client* and rotating it
 *    resets a session limit for free. The IP is the only identifier here the
 *    caller does not choose;
 *  - per workspace per day, a backstop so a distributed flood still cannot run
 *    up an unbounded bill overnight.
 *
 * The limiter uses Redis when reachable and fails open otherwise: a Redis blip
 * must not take a buyer's website chat offline.
 */

const LIMITS = {
  session: { windowSeconds: 60, max: 12 },
  ip: { windowSeconds: 60, max: 20 },
  /**
   * Generous for a real business. Lower it with WIDGET_DAILY_LIMIT on a public
   * demo, where the traffic is strangers rather than customers and every
   * message spends the operator's own AI credit.
   */
  workspaceDay: {
    windowSeconds: 86_400,
    max: Number(process.env.WIDGET_DAILY_LIMIT) || 2_000,
  },
};

/**
 * Behind nginx and Cloudflare the socket address is always the proxy, so read
 * the forwarded headers. A caller can forge these, but forging one still costs
 * them the session and daily limits, and honest traffic is measured correctly.
 */
function clientIp(req: Request): string {
  const forwarded =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

export const POST = withPublic(async (req) => {
  const body = await parseBody(req, widgetMessageSchema);

  const rules: RateLimitRule[] = [
    { scope: 'widget:session', key: body.sessionId, ...LIMITS.session },
    { scope: 'widget:ip', key: clientIp(req), ...LIMITS.ip },
    { scope: 'widget:day', key: body.workspaceSlug, ...LIMITS.workspaceDay },
  ];
  const verdict = await checkRateLimits(rules);
  if (!verdict.allowed) {
    return tooManyRequests(
      'Too many messages. Please wait a moment before sending another.',
      verdict,
    );
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug: body.workspaceSlug },
    select: { id: true },
  });
  if (!workspace) return fail(404, 'Unknown workspace.');

  const agent = await prisma.aiAgent.findFirst({
    where: { workspaceId: workspace.id, isActive: true, channels: { has: 'chat' } },
    orderBy: { isDefault: 'desc' },
    select: { id: true },
  });
  if (!agent) return fail(404, 'No chat agent is available.');

  // Identify the visitor only once they volunteer contact details.
  let contactId: string | null = null;
  let contactName: string | null = body.visitor?.name ?? null;

  if (body.visitor?.email || body.visitor?.phone) {
    const contact = await upsertContact(workspace.id, {
      name: body.visitor.name ?? body.visitor.email ?? 'Website visitor',
      email: body.visitor.email ?? null,
      phone: normalizePhone(body.visitor.phone),
    });
    contactId = contact.id;
    contactName = contact.name;
  }

  // One conversation per widget session.
  let conversation = await prisma.conversation.findFirst({
    where: { workspaceId: workspace.id, externalId: body.sessionId, channel: 'chat' },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId: workspace.id,
        contactId,
        agentId: agent.id,
        channel: 'chat',
        externalId: body.sessionId,
        subject: 'Website chat',
      },
    });
  } else if (contactId && !conversation.contactId) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { contactId },
    });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'in',
      sender: 'contact',
      body: body.message,
    },
  });

  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 30,
    select: { direction: true, body: true },
  });

  const chatHistory: ChatMessage[] = history.map((m) => ({
    role: m.direction === 'in' ? 'user' : 'assistant',
    content: m.body,
  }));

  const workspaceId = workspace.id;
  const conversationId = conversation.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // A website visitor closing the chat bubble mid-reply is routine, and
      // once they do, enqueueing throws. Left unhandled that aborts the loop
      // before the provider's final chunk, so the reply is never saved to the
      // inbox and the tokens it burned are never metered.
      let clientGone = false;
      const send = (event: string, data: unknown) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          clientGone = true;
        }
      };

      let full = '';
      let escalated = false;

      try {
        for await (const chunk of streamAgentReply({
          workspaceId,
          agentId: agent.id,
          history: chatHistory,
          contactName,
          channel: 'chat',
        })) {
          if (chunk.type === 'text') {
            full += chunk.text;
            send('token', { text: chunk.text });
          }
          if (chunk.type === 'error') {
            send('error', {
              message: 'Sorry, I could not respond just now. Please try again.',
            });
            console.error('[widget]', chunk.message);
          }
        }

        // A visitor who leaves details is a lead — notify the team.
        if (contactId) {
          escalated = true;
          await logActivity({
            workspaceId,
            contactId,
            type: 'message',
            title: 'Website chat',
            body: body.message,
          });
        }

        send('done', { conversationId });
      } catch (error) {
        send('error', { message: 'Something went wrong.' });
        console.error('[widget] stream failed', (error as Error).message);
      } finally {
        // Persist in `finally`: a reply the visitor walked away from still
        // belongs in the operator's inbox, and it was still paid for.
        if (full.trim()) {
          await prisma.message
            .create({ data: { conversationId, direction: 'out', sender: 'ai', body: full } })
            .then(() =>
              prisma.conversation.update({
                where: { id: conversationId },
                data: { lastMessageAt: new Date() },
              }),
            )
            .catch(() => undefined);
        }

        try {
          controller.close();
        } catch {
          // Already closed by the disconnect.
        }

        if (escalated) {
          void sendPush(workspaceId, {
            title: 'New website chat lead',
            body: `${contactName ?? 'A visitor'} started a conversation.`,
            url: `/dashboard/inbox?conversation=${conversationId}`,
          }).catch(() => undefined);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...rateLimitHeaders(verdict),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    },
  });
});

export const OPTIONS = withPublic(async () => new Response(null, { status: 204 }));
