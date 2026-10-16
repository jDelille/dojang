import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/integrations/twilio';
import { renderTransactional } from '@/lib/email-templates';
import { sendEmail, renderEmail, textToHtml } from '@/lib/integrations/mailer';
import { sendPush } from '@/lib/integrations/push';
import { daysAgo } from '@/lib/utils';
import {
  ACTION_LABELS,
  formatDelay,
  parseSteps,
  type RetentionLogEntry,
  type RetentionStep,
} from '@/lib/retention-shared';
import type { Contact, RetentionRule, Workspace } from '@prisma/client';

/**
 * Retention engine (spec §4.3): trigger → condition → action, plus a
 * multi-step drip sequence with delays and open/click/reply branching.
 *
 * A rule's `steps` column is a JSON array of RetentionStep. Runs advance one
 * step at a time through BullMQ delayed jobs, so a 14-day wait costs nothing
 * while it's pending.
 *
 * This module is server-only — it imports Twilio, Nodemailer and web-push.
 * Client components import the labels and types from lib/retention-shared.
 */

export * from '@/lib/retention-shared';

// ── Audience matching ────────────────────────────────────────────────────────

/**
 * Finds contacts that currently satisfy a rule's trigger. Called every 5
 * minutes by the retention scan job.
 */
export async function findMatchingContacts(rule: RetentionRule): Promise<Contact[]> {
  const config = (rule.triggerConfig ?? {}) as Record<string, unknown>;
  const audience = (rule.audience ?? {}) as { tags?: string[]; statuses?: string[] };

  const where: Record<string, unknown> = { workspaceId: rule.workspaceId };

  if (audience.tags?.length) where.tags = { hasSome: audience.tags };

  switch (rule.triggerType) {
    case 'no_activity': {
      const days = Number(config.days ?? 14);
      where.OR = [
        { lastActivityAt: { lte: daysAgo(days) } },
        { lastActivityAt: null, createdAt: { lte: daysAgo(days) } },
      ];
      break;
    }

    case 'lead_created': {
      const withinHours = Number(config.withinHours ?? 24);
      where.createdAt = { gte: new Date(Date.now() - withinHours * 3_600_000) };
      break;
    }

    case 'lead_status_changed': {
      const status = String(config.status ?? 'won');
      where.lead = { status };
      break;
    }

    case 'tag_added': {
      const tag = String(config.tag ?? '');
      if (!tag) return [];
      where.tags = { has: tag };
      break;
    }

    case 'appointment_booked':
      where.appointments = { some: { status: { in: ['scheduled', 'confirmed'] } } };
      break;

    case 'appointment_completed':
      where.appointments = { some: { status: 'completed' } };
      break;

    case 'invoice_paid':
      where.invoices = { some: { status: 'paid' } };
      break;

    case 'missed_call':
      where.calls = { some: { missed: true, createdAt: { gte: daysAgo(1) } } };
      break;

    case 'manual':
      return [];
  }

  return prisma.contact.findMany({ where: where as never, take: 500 });
}

// ── Step execution ───────────────────────────────────────────────────────────

export type StepContext = {
  workspace: Workspace;
  contact: Contact;
  rule: RetentionRule;
  dryRun: boolean;
};

/** Fills {{name}}, {{business}}, {{first_name}} etc. in step copy. */
export function renderTemplate(template: string, ctx: StepContext): string {
  const firstName = ctx.contact.name?.split(/\s+/)[0] ?? 'there';
  const vars: Record<string, string> = {
    name: ctx.contact.name || 'there',
    first_name: firstName,
    email: ctx.contact.email ?? '',
    phone: ctx.contact.phone ?? '',
    company: ctx.contact.company ?? '',
    business: ctx.workspace.businessName || ctx.workspace.name,
    business_phone: ctx.workspace.businessPhone ?? '',
    business_email: ctx.workspace.businessEmail ?? '',
  };

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => vars[key] ?? match);
}

/** The same variable set renderTemplate uses, for workspace email templates. */
function templateVars(ctx: StepContext): Record<string, string> {
  return {
    name: ctx.contact.name || 'there',
    first_name: ctx.contact.name?.split(/\s+/)[0] ?? 'there',
    email: ctx.contact.email ?? '',
    phone: ctx.contact.phone ?? '',
    company: ctx.contact.company ?? '',
    business: ctx.workspace.businessName || ctx.workspace.name,
    business_phone: ctx.workspace.businessPhone ?? '',
    business_email: ctx.workspace.businessEmail ?? '',
  };
}

export async function executeStep(
  step: RetentionStep,
  ctx: StepContext,
): Promise<RetentionLogEntry> {
  const base = { at: new Date().toISOString(), action: step.action };

  // Branch: stop the sequence once the contact engages.
  if (step.skipIfReplied) {
    const replied = await prisma.message.findFirst({
      where: {
        conversation: { workspaceId: ctx.workspace.id, contactId: ctx.contact.id },
        direction: 'in',
        createdAt: { gte: ctx.rule.lastRunAt ?? daysAgo(30) },
      },
      select: { id: true },
    });
    if (replied) {
      return { ...base, stepIndex: -1, status: 'skipped', detail: 'Contact already replied.' };
    }
  }

  if (ctx.dryRun) {
    return {
      ...base,
      stepIndex: -1,
      status: 'dry-run',
      detail: describeStep(step, ctx),
    };
  }

  try {
    switch (step.action) {
      case 'send_email': {
        if (!ctx.contact.email) {
          return { ...base, stepIndex: -1, status: 'skipped', detail: 'Contact has no email.' };
        }
        if (ctx.contact.optedOutEmail) {
          return { ...base, stepIndex: -1, status: 'skipped', detail: 'Contact opted out of email.' };
        }

        const subject = renderTemplate(step.subject || 'A quick note', ctx);
        const body = renderTemplate(step.body || '', ctx);

        await sendEmail(ctx.workspace.id, {
          to: ctx.contact.email,
          subject,
          html: await renderTransactional(
            ctx.workspace.id,
            'retention',
            {
              businessName: ctx.workspace.businessName || ctx.workspace.name,
              accentColor: ctx.workspace.accentColor,
              logoUrl: ctx.workspace.logoUrl,
            },
            // The rule's own copy stays the body — a workspace template only
            // replaces it when the buyer has written one.
            textToHtml(body),
            templateVars(ctx),
          ),
          replyTo: ctx.workspace.businessEmail ?? undefined,
        });

        return { ...base, stepIndex: -1, status: 'sent', detail: `Email to ${ctx.contact.email}` };
      }

      case 'send_sms': {
        if (!ctx.contact.phone) {
          return { ...base, stepIndex: -1, status: 'skipped', detail: 'Contact has no phone.' };
        }
        if (ctx.contact.optedOutSms) {
          return { ...base, stepIndex: -1, status: 'skipped', detail: 'Contact opted out of SMS.' };
        }

        await sendSms(ctx.workspace.id, ctx.contact.phone, renderTemplate(step.body || '', ctx));
        return { ...base, stepIndex: -1, status: 'sent', detail: `SMS to ${ctx.contact.phone}` };
      }

      case 'send_push':
      case 'notify_team': {
        await sendPush(ctx.workspace.id, {
          title: renderTemplate(step.subject || ctx.rule.name, ctx),
          body: renderTemplate(step.body || '', ctx),
          url: `/dashboard/inbox?contact=${ctx.contact.id}`,
        });
        return { ...base, stepIndex: -1, status: 'sent', detail: 'Push notification sent.' };
      }

      case 'add_tag': {
        if (!step.tag) return { ...base, stepIndex: -1, status: 'skipped', detail: 'No tag set.' };
        await prisma.contact.update({
          where: { id: ctx.contact.id },
          data: { tags: { push: step.tag } },
        });
        return { ...base, stepIndex: -1, status: 'sent', detail: `Tagged "${step.tag}"` };
      }

      case 'remove_tag': {
        if (!step.tag) return { ...base, stepIndex: -1, status: 'skipped', detail: 'No tag set.' };
        await prisma.contact.update({
          where: { id: ctx.contact.id },
          data: { tags: ctx.contact.tags.filter((t) => t !== step.tag) },
        });
        return { ...base, stepIndex: -1, status: 'sent', detail: `Removed tag "${step.tag}"` };
      }

      case 'change_stage': {
        if (!step.stageKey) {
          return { ...base, stepIndex: -1, status: 'skipped', detail: 'No stage set.' };
        }
        const stage = await prisma.pipelineStage.findUnique({
          where: { workspaceId_key: { workspaceId: ctx.workspace.id, key: step.stageKey } },
        });
        if (!stage) {
          return { ...base, stepIndex: -1, status: 'failed', detail: 'Stage not found.' };
        }
        await prisma.deal.updateMany({
          where: { contactId: ctx.contact.id, status: 'open' },
          data: { stageId: stage.id },
        });
        return { ...base, stepIndex: -1, status: 'sent', detail: `Moved to ${stage.name}` };
      }

      case 'create_task': {
        // Prefer whoever already owns the originating lead, so the follow-up
        // lands with the person who knows the history. An unassigned task
        // shows to everyone but belongs to no one, which is how they rot.
        const owner = await prisma.lead.findFirst({
          where: { contact: { id: ctx.contact.id }, ownerId: { not: null } },
          select: { ownerId: true },
        });

        await prisma.task.create({
          data: {
            workspaceId: ctx.workspace.id,
            contactId: ctx.contact.id,
            assigneeId: owner?.ownerId ?? null,
            title: renderTemplate(step.subject || `Follow up with ${ctx.contact.name}`, ctx),
            dueAt: new Date(Date.now() + 86_400_000),
          },
        });
        return { ...base, stepIndex: -1, status: 'sent', detail: 'Task created.' };
      }

      case 'request_review': {
        const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/r/${ctx.workspace.slug}`;
        const message = renderTemplate(
          step.body || `Thanks for choosing {{business}}! Would you leave us a review? ${link}`,
          ctx,
        );

        if (ctx.contact.phone && !ctx.contact.optedOutSms) {
          await sendSms(ctx.workspace.id, ctx.contact.phone, message);
        } else if (ctx.contact.email && !ctx.contact.optedOutEmail) {
          await sendEmail(ctx.workspace.id, {
            to: ctx.contact.email,
            subject: renderTemplate(step.subject || 'How did we do?', ctx),
            html: await renderTransactional(
              ctx.workspace.id,
              'review_request',
              {
                businessName: ctx.workspace.businessName || ctx.workspace.name,
                accentColor: ctx.workspace.accentColor,
                logoUrl: ctx.workspace.logoUrl,
              },
              textToHtml(message),
              { ...templateVars(ctx), review_link: link },
              { label: 'Leave a review', url: link },
            ),
          });
        } else {
          return { ...base, stepIndex: -1, status: 'skipped', detail: 'No reachable channel.' };
        }

        return { ...base, stepIndex: -1, status: 'sent', detail: 'Review request sent.' };
      }

      case 'wait':
        return { ...base, stepIndex: -1, status: 'sent', detail: 'Waited.' };

      default:
        return { ...base, stepIndex: -1, status: 'skipped', detail: 'Unknown action.' };
    }
  } catch (error) {
    return { ...base, stepIndex: -1, status: 'failed', detail: (error as Error).message };
  }
}

export function describeStep(step: RetentionStep, ctx?: StepContext): string {
  const label = ACTION_LABELS[step.action] ?? step.action;
  const delay = step.delayMinutes ? ` after ${formatDelay(step.delayMinutes)}` : '';

  switch (step.action) {
    case 'send_email':
      return `${label}${delay}: "${ctx ? renderTemplate(step.subject ?? '', ctx) : step.subject ?? ''}"`;
    case 'send_sms':
      return `${label}${delay}: "${(ctx ? renderTemplate(step.body ?? '', ctx) : step.body ?? '').slice(0, 80)}"`;
    case 'add_tag':
    case 'remove_tag':
      return `${label}${delay}: ${step.tag ?? '—'}`;
    case 'change_stage':
      return `${label}${delay}: ${step.stageKey ?? '—'}`;
    default:
      return `${label}${delay}`;
  }
}

/** Ready-made sequences offered in the rule builder. */
export const RULE_TEMPLATES: {
  name: string;
  description: string;
  triggerType: RetentionRule['triggerType'];
  triggerConfig: Record<string, unknown>;
  steps: RetentionStep[];
}[] = [
  {
    name: 'Win back quiet customers',
    description: 'Nudge anyone who has gone quiet for two weeks, then follow up by SMS.',
    triggerType: 'no_activity',
    triggerConfig: { days: 14 },
    steps: [
      {
        action: 'send_email',
        subject: 'We miss you, {{first_name}}',
        body: "Hi {{first_name}},\n\nIt's been a little while since we last spoke. Is there anything we can help with?\n\n— {{business}}",
      },
      {
        action: 'send_sms',
        delayMinutes: 4320,
        skipIfReplied: true,
        body: 'Hi {{first_name}}, just checking in from {{business}}. Anything we can help with?',
      },
      { action: 'create_task', delayMinutes: 4320, skipIfReplied: true, subject: 'Call {{name}} — no response to win-back sequence' },
    ],
  },
  {
    name: 'New lead welcome',
    description: 'Respond to every new lead within minutes, then follow up next day.',
    triggerType: 'lead_created',
    triggerConfig: { withinHours: 1 },
    steps: [
      {
        action: 'send_email',
        subject: 'Thanks for reaching out to {{business}}',
        body: "Hi {{first_name}},\n\nThanks for getting in touch. We've received your enquiry and someone will be with you shortly.\n\n— {{business}}",
      },
      {
        action: 'send_sms',
        delayMinutes: 1440,
        skipIfReplied: true,
        body: 'Hi {{first_name}}, {{business}} here — did you still need a hand with your enquiry?',
      },
    ],
  },
  {
    name: 'Appointment reminder',
    description: 'Text a reminder 24 hours before the appointment.',
    triggerType: 'appointment_booked',
    triggerConfig: {},
    steps: [
      {
        action: 'send_sms',
        body: "Reminder: your appointment with {{business}} is tomorrow. Reply here if you need to reschedule.",
      },
    ],
  },
  {
    name: 'Ask for a review',
    description: 'Request a review two days after a completed appointment.',
    triggerType: 'appointment_completed',
    triggerConfig: {},
    steps: [
      { action: 'wait', delayMinutes: 2880 },
      {
        action: 'request_review',
        subject: 'How did we do?',
        body: 'Thanks for choosing {{business}}, {{first_name}}! If we did a good job, a quick review would mean a lot.',
      },
    ],
  },
];
