import { prisma } from '@/lib/db';
import { withPublic } from '@/lib/api';
import { validateTwilioSignature } from '@/lib/integrations/twilio';
import { readTwilioForm, requestUrl, resolveWorkspaceByNumber } from '@/lib/voice';
import { generateAgentReply } from '@/lib/ai';
import { logActivity, upsertContact } from '@/lib/workspace';
import { normalizePhone } from '@/lib/utils';
import { sendPush } from '@/lib/integrations/push';
import type { ChatMessage } from '@/lib/ai/adapter';

/**
 * Inbound SMS / WhatsApp webhook. Threads into the unified inbox and lets the
 * AI agent reply when it's enabled for the SMS channel (spec §4.7).
 *
 * Replies with TwiML so Twilio sends the response on the same request — no
 * second API call, no extra latency.
 */
export const POST = withPublic(async (req) => {
  const form = await readTwilioForm(req);
  const from = form.From ?? '';
  const to = form.To ?? '';
  const bodyText = (form.Body ?? '').trim();
  const isWhatsApp = from.startsWith('whatsapp:');

  const workspaceId = await resolveWorkspaceByNumber(to.replace('whatsapp:', ''));
  if (!workspaceId) return xml('<Response/>');

  const signatureValid = await validateTwilioSignature(
    workspaceId,
    req.headers.get('x-twilio-signature'),
    requestUrl(req),
    form,
  );
  if (!signatureValid) return new Response('Invalid Twilio signature', { status: 403 });

  const phone = normalizePhone(from.replace('whatsapp:', ''));
  if (!phone || !bodyText) return xml('<Response/>');

  // STOP/START are legal obligations, not features — honour them before
  // anything else and never let the AI reply to them.
  const keyword = bodyText.toUpperCase();
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(keyword)) {
    await prisma.contact.updateMany({
      where: { workspaceId, phone },
      data: { optedOutSms: true },
    });
    return xml('<Response/>');
  }
  if (['START', 'YES', 'UNSTOP'].includes(keyword)) {
    await prisma.contact.updateMany({
      where: { workspaceId, phone },
      data: { optedOutSms: false },
    });
    return xml('<Response/>');
  }

  const channel = isWhatsApp ? 'whatsapp' : 'sms';
  const contact = await upsertContact(workspaceId, { phone, name: phone });

  let conversation = await prisma.conversation.findFirst({
    where: { workspaceId, contactId: contact.id, channel, isOpen: true },
    orderBy: { lastMessageAt: 'desc' },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { workspaceId, contactId: contact.id, channel, subject: `${channel} thread` },
    });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'in',
      sender: 'contact',
      body: bodyText,
      mediaUrl: form.MediaUrl0 ?? null,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  await logActivity({
    workspaceId,
    contactId: contact.id,
    type: 'message',
    title: `Inbound ${channel} from ${phone}`,
    body: bodyText,
  });

  // Does an active agent handle this channel?
  const agent = await prisma.aiAgent.findFirst({
    where: { workspaceId, isActive: true, channels: { has: channel } },
    orderBy: { isDefault: 'desc' },
    select: { id: true },
  });

  if (!agent) {
    await sendPush(workspaceId, {
      title: `New ${channel} message`,
      body: `${contact.name}: ${bodyText.slice(0, 80)}`,
      url: `/dashboard/inbox?conversation=${conversation.id}`,
    });
    return xml('<Response/>');
  }

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

  try {
    const reply = await generateAgentReply({
      workspaceId,
      agentId: agent.id,
      history: chatHistory,
      contactName: contact.name,
      channel,
    });

    const text = reply.text.trim();
    if (!text) return xml('<Response/>');

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'out',
        sender: 'ai',
        body: text,
        tokensIn: reply.usage.inputTokens,
        tokensOut: reply.usage.outputTokens,
      },
    });

    if (reply.escalate) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { needsHuman: true },
      });
      await sendPush(workspaceId, {
        title: 'Conversation needs a human',
        body: `${contact.name} asked for something the agent handed off.`,
        url: `/dashboard/inbox?conversation=${conversation.id}`,
      });
    }

    return xml(`<Response><Message>${escapeXml(text.slice(0, 1500))}</Message></Response>`);
  } catch (error) {
    console.error('[sms] agent reply failed', (error as Error).message);
    return xml('<Response/>');
  }
});

function xml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
