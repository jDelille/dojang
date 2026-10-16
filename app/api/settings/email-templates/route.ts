import { z } from 'zod';
import { prisma } from '@/lib/db';
import { created, fail, ok, parseBody, withWorkspace } from '@/lib/api';
import { TEMPLATE_KINDS, fillTemplate, fillTemplateWithHtml } from '@/lib/email-templates';
import { renderEmail, sendEmail, textToHtml } from '@/lib/integrations/mailer';

const KINDS = ['shell','invoice','appointment_reminder','review_request','retention','inbox_reply'] as const;

const saveSchema = z.object({
  kind: z.enum(KINDS),
  subject: z.string().max(300).optional().nullable(),
  html: z.string().max(100_000),
  isActive: z.boolean().optional(),
});

const testSchema = z.object({
  kind: z.enum(KINDS),
  html: z.string().max(100_000),
  subject: z.string().max(300).optional().nullable(),
  to: z.string().email(),
});

/** Sample data so a preview reads like a real message, not {{braces}}. */
const SAMPLE: Record<string, string> = {
  name: 'Dana Whitfield', first_name: 'Dana', email: 'dana@example.com',
  phone: '+1 512 555 0134', company: 'Whitfield & Co', business: 'Your Business',
  business_phone: '+1 512 555 0100', business_email: 'hello@yourbusiness.com',
  invoice_number: 'INV-0042', amount: '$1,280.00', due_date: '14 August 2026',
  pay_link: 'https://example.com/pay/demo', appointment_title: 'Consultation',
  appointment_time: 'Friday 14 Aug, 2:00 PM', location: 'Zoom',
  review_link: 'https://example.com/r/your-business',
  message: 'Thanks for getting in touch — happy to help with that.',
  year: String(new Date().getFullYear()), accent: '#E8A33D', logo_url: '',
};

export const GET = withWorkspace(async (ctx) => {
  const rows = await prisma.emailTemplate.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { kind: true, subject: true, html: true, isActive: true, updatedAt: true },
  });
  const byKind = new Map(rows.map((r) => [r.kind, r]));

  return ok({
    templates: TEMPLATE_KINDS.map((meta) => ({ ...meta, override: byKind.get(meta.kind) ?? null })),
  });
}, 'integrations:manage');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, saveSchema);

  // The wrapper must say where the message goes, or every email it wraps
  // arrives empty. Worth refusing at save time rather than discovering it live.
  if (body.kind === 'shell' && body.html.trim() && !/\{\{\s*content\s*\}\}/.test(body.html)) {
    return fail(422, 'The wrapper must contain {{content}} — that is where each message body is inserted.');
  }

  const row = await prisma.emailTemplate.upsert({
    where: { workspaceId_kind: { workspaceId: ctx.workspaceId, kind: body.kind } },
    create: {
      workspaceId: ctx.workspaceId, kind: body.kind,
      subject: body.subject ?? null, html: body.html, isActive: body.isActive ?? true,
    },
    update: { subject: body.subject ?? null, html: body.html, isActive: body.isActive ?? true },
    select: { kind: true, subject: true, html: true, isActive: true, updatedAt: true },
  });

  return created({ template: row });
}, 'integrations:manage');

/** Sends the draft to a real inbox so it can be judged in an actual client. */
export const PUT = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, testSchema);
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });

  const brand = {
    businessName: workspace.businessName || workspace.name,
    accentColor: workspace.accentColor,
    logoUrl: workspace.logoUrl,
  };
  const vars = { ...SAMPLE, business: brand.businessName, logo_url: brand.logoUrl ?? '' };

  const html =
    body.kind === 'shell'
      ? fillTemplateWithHtml(body.html, vars, 'content',
          textToHtml('This is the sample message body. Your wrapper is drawn around it.'))
      : renderEmail(brand, fillTemplate(body.html, vars));

  try {
    const res = await sendEmail(ctx.workspaceId, {
      to: body.to,
      subject: (body.subject ? fillTemplate(body.subject, vars) : 'Roster template test').replace(/<[^>]*>/g, ''),
      html,
    });
    return ok({ sent: true, messageId: res.messageId });
  } catch (error) {
    return fail(502, `Could not send the test: ${(error as Error).message}`);
  }
}, 'integrations:manage');

export const DELETE = withWorkspace(async (ctx, req) => {
  const kind = new URL(req.url).searchParams.get('kind');
  if (!kind || !KINDS.includes(kind as never)) return fail(400, 'Unknown template.');

  // Deleting an override restores the built-in renderer rather than blanking.
  await prisma.emailTemplate.deleteMany({
    where: { workspaceId: ctx.workspaceId, kind: kind as never },
  });
  return ok({ reverted: kind });
}, 'integrations:manage');
