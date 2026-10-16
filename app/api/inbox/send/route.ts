import { prisma } from '@/lib/db';
import { created, fail, parseBody, withWorkspace } from '@/lib/api';
import { inboxSendSchema } from '@/lib/validation';
import { sendSms, sendWhatsApp } from '@/lib/integrations/twilio';
import { renderEmail, sendEmail, textToHtml } from '@/lib/integrations/mailer';
import { logActivity } from '@/lib/workspace';

/**
 * Human reply from the inbox. Delivery is per-channel: SMS/WhatsApp go through
 * Twilio, email through SMTP, and web-chat messages are simply persisted for
 * the widget to poll.
 */
export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, inboxSendSchema);

  const conversation = await prisma.conversation.findFirst({
    where: { id: body.conversationId, workspaceId: ctx.workspaceId },
    include: { contact: true },
  });
  if (!conversation) return fail(404, 'Conversation not found.');

  const channel = body.channel ?? conversation.channel;
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });

  try {
    switch (channel) {
      case 'sms': {
        if (!conversation.contact?.phone) return fail(422, 'That contact has no phone number.');
        if (conversation.contact.optedOutSms) {
          return fail(409, 'That contact has opted out of SMS.');
        }
        await sendSms(ctx.workspaceId, conversation.contact.phone, body.body);
        break;
      }

      case 'whatsapp': {
        if (!conversation.contact?.phone) return fail(422, 'That contact has no phone number.');
        await sendWhatsApp(ctx.workspaceId, conversation.contact.phone, body.body);
        break;
      }

      case 'email': {
        if (!conversation.contact?.email) return fail(422, 'That contact has no email address.');
        if (conversation.contact.optedOutEmail) {
          return fail(409, 'That contact has opted out of email.');
        }
        await sendEmail(ctx.workspaceId, {
          to: conversation.contact.email,
          subject: conversation.subject || `Message from ${workspace.businessName || workspace.name}`,
          html: renderEmail(
            {
              businessName: workspace.businessName || workspace.name,
              accentColor: workspace.accentColor,
              logoUrl: workspace.logoUrl,
            },
            textToHtml(body.body),
          ),
          replyTo: workspace.businessEmail ?? undefined,
        });
        break;
      }

      case 'chat':
      default:
        // Widget messages are delivered by polling — nothing to send outward.
        break;
    }
  } catch (error) {
    return fail(502, `Could not deliver the message: ${(error as Error).message}`);
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'out',
      sender: 'human',
      body: body.body,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    // A human replying clears the escalation flag.
    data: { lastMessageAt: new Date(), needsHuman: false },
  });

  await logActivity({
    workspaceId: ctx.workspaceId,
    contactId: conversation.contactId,
    userId: ctx.userId,
    type: 'message',
    title: `Replied via ${channel}`,
    body: body.body,
  });

  return created({ message });
}, 'inbox:write');
