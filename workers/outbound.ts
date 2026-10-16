import { Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { createRedisConnection, QUEUE_NAMES, type OutboundJobData } from '@/lib/queue';
import { sendSms } from '@/lib/integrations/twilio';
import { renderEmail, sendEmail, textToHtml } from '@/lib/integrations/mailer';
import { sendPush } from '@/lib/integrations/push';

/**
 * Generic outbound send queue. Anything user-facing that shouldn't block a web
 * request (bulk sends, notify-team fan-outs) goes through here so provider
 * failures get BullMQ's retry/backoff instead of a 500.
 */
export function createOutboundWorker() {
  return new Worker<OutboundJobData>(
    QUEUE_NAMES.outbound,
    async (job: Job<OutboundJobData>) => {
      const data = job.data;

      switch (data.kind) {
        case 'sms': {
          const contact = data.contactId
            ? await prisma.contact.findUnique({
                where: { id: data.contactId },
                select: { optedOutSms: true },
              })
            : null;
          if (contact?.optedOutSms) return { skipped: 'opted out' };

          await sendSms(data.workspaceId, data.to, data.body);
          return { sent: true };
        }

        case 'email': {
          const contact = data.contactId
            ? await prisma.contact.findUnique({
                where: { id: data.contactId },
                select: { optedOutEmail: true },
              })
            : null;
          if (contact?.optedOutEmail) return { skipped: 'opted out' };

          const workspace = await prisma.workspace.findUniqueOrThrow({
            where: { id: data.workspaceId },
          });

          await sendEmail(data.workspaceId, {
            to: data.to,
            subject: data.subject,
            html: renderEmail(
              {
                businessName: workspace.businessName || workspace.name,
                accentColor: workspace.accentColor,
                logoUrl: workspace.logoUrl,
              },
              data.html.includes('<') ? data.html : textToHtml(data.html),
            ),
            replyTo: workspace.businessEmail ?? undefined,
          });
          return { sent: true };
        }

        case 'push': {
          const result = await sendPush(
            data.workspaceId,
            { title: data.title, body: data.body, url: data.url },
            data.contactId ? { contactId: data.contactId } : undefined,
          );
          return result;
        }

        default:
          return { skipped: 'unknown job kind' };
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 10,
      limiter: { max: 30, duration: 1_000 }, // stay under provider rate limits
    },
  );
}
