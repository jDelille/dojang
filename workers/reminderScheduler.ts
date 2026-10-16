import { Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { createRedisConnection, QUEUE_NAMES, type ReminderJobData } from '@/lib/queue';
import { sendSms } from '@/lib/integrations/twilio';
import { renderEmail, sendEmail, textToHtml } from '@/lib/integrations/mailer';
import { sendPush } from '@/lib/integrations/push';
import { logActivity } from '@/lib/workspace';

/**
 * Appointment reminder worker (spec §4.5).
 *
 * Two job types:
 *   'remind' — fires for one appointment at its scheduled time.
 *   'sweep'  — every 15 minutes, catches appointments whose reminder job was
 *              lost (Redis restart, worker downtime) or that were created
 *              directly in the database.
 */

export function createReminderWorker() {
  return new Worker<ReminderJobData>(
    QUEUE_NAMES.reminder,
    async (job: Job<ReminderJobData>) => {
      if (job.name === 'sweep') return runSweep();
      return sendReminder(job.data.appointmentId);
    },
    {
      connection: createRedisConnection(),
      concurrency: 5,
    },
  );
}

async function runSweep() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 3_600_000);

  const due = await prisma.appointment.findMany({
    where: {
      reminderSent: false,
      status: { in: ['scheduled', 'confirmed'] },
      startsAt: { gt: now, lte: horizon },
    },
    select: { id: true },
    take: 200,
  });

  let sent = 0;
  for (const appointment of due) {
    const result = await sendReminder(appointment.id);
    if (result.sent) sent += 1;
  }

  if (sent) console.log(`[reminder] sweep sent ${sent} reminder(s)`);
  return { checked: due.length, sent };
}

async function sendReminder(appointmentId: string): Promise<{ sent: boolean; reason?: string }> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { contact: true, workspace: true },
  });

  if (!appointment) return { sent: false, reason: 'appointment deleted' };
  if (appointment.reminderSent) return { sent: false, reason: 'already sent' };
  if (['cancelled', 'completed', 'no_show'].includes(appointment.status)) {
    return { sent: false, reason: `status is ${appointment.status}` };
  }
  if (appointment.startsAt < new Date()) {
    // Missed window (worker was down) — mark it so the sweep stops retrying.
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { reminderSent: true },
    });
    return { sent: false, reason: 'appointment already started' };
  }

  const { contact, workspace } = appointment;
  const businessName = workspace.businessName || workspace.name;

  const when = appointment.startsAt.toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: workspace.timezone || 'UTC',
  });

  const message = `Reminder: your appointment with ${businessName} is ${when}${
    appointment.location ? ` at ${appointment.location}` : ''
  }. Reply here if you need to reschedule.`;

  let delivered = false;

  if (contact.phone && !contact.optedOutSms) {
    try {
      await sendSms(workspace.id, contact.phone, message);
      delivered = true;
    } catch (error) {
      console.error('[reminder] SMS failed', (error as Error).message);
    }
  }

  if (!delivered && contact.email && !contact.optedOutEmail) {
    try {
      await sendEmail(workspace.id, {
        to: contact.email,
        subject: `Reminder: ${appointment.title}`,
        html: renderEmail(
          {
            businessName,
            accentColor: workspace.accentColor,
            logoUrl: workspace.logoUrl,
          },
          textToHtml(`Hi ${contact.name.split(/\s+/)[0]},\n\n${message}`),
        ),
        replyTo: workspace.businessEmail ?? undefined,
      });
      delivered = true;
    } catch (error) {
      console.error('[reminder] email failed', (error as Error).message);
    }
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { reminderSent: true },
  });

  if (delivered) {
    await logActivity({
      workspaceId: workspace.id,
      contactId: contact.id,
      type: 'appointment',
      title: 'Appointment reminder sent',
      body: message,
    });
  } else {
    // Nothing reached the customer — tell the team so they can call.
    await sendPush(workspace.id, {
      title: 'Reminder could not be delivered',
      body: `${contact.name} has no reachable phone or email for ${appointment.title}.`,
      url: '/dashboard/appointments',
    }).catch(() => undefined);
  }

  return { sent: delivered, reason: delivered ? undefined : 'no reachable channel' };
}
