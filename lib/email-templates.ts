import type { EmailTemplateKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { escapeHtml, renderEmail } from '@/lib/integrations/mailer';

/**
 * Buyer-editable transactional emails.
 *
 * The built-in renderer stays the default and the fallback, so an install that
 * never touches this keeps working and an override that gets deleted degrades
 * back rather than sending a blank message.
 *
 * Values are HTML-escaped on substitution. A buyer writing the template is
 * trusted with markup; the *data* going into it — a contact name, an invoice
 * number — is not, or a customer called `<script>` would be injected into
 * every email their business sends.
 */

export interface TemplateVars {
  [key: string]: string | number | null | undefined;
}

export const TEMPLATE_KINDS: Array<{
  kind: EmailTemplateKind;
  label: string;
  description: string;
  variables: string[];
}> = [
  {
    kind: 'shell',
    label: 'Email wrapper',
    description:
      'The frame every email is rendered inside — header, logo, footer. Use {{content}} to mark where the message body goes.',
    variables: ['content', 'business', 'logo_url', 'accent', 'year'],
  },
  {
    kind: 'invoice',
    label: 'Invoice / estimate',
    description: 'Sent when an invoice or estimate is emailed to a customer.',
    variables: ['name', 'first_name', 'business', 'invoice_number', 'amount', 'due_date', 'pay_link'],
  },
  {
    kind: 'appointment_reminder',
    label: 'Appointment reminder',
    description: 'Sent 24 hours before a booking.',
    variables: ['name', 'first_name', 'business', 'appointment_title', 'appointment_time', 'location'],
  },
  {
    kind: 'review_request',
    label: 'Review request',
    description: 'Sent by a retention rule asking for a review.',
    variables: ['name', 'first_name', 'business', 'review_link'],
  },
  {
    kind: 'retention',
    label: 'Retention follow-up',
    description: 'The generic follow-up used by retention rules that send email.',
    variables: ['name', 'first_name', 'business', 'business_phone', 'business_email'],
  },
  {
    kind: 'inbox_reply',
    label: 'Inbox reply',
    description: 'Sent when a team member or the AI replies to a conversation by email.',
    variables: ['name', 'first_name', 'business', 'message'],
  },
];

/** Substitutes {{vars}}, escaping every value. */
export function fillTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null) return match;
    return escapeHtml(String(value));
  });
}

/**
 * Same, but leaves one named variable unescaped.
 *
 * Needed only for the shell's {{content}}, which is HTML we generated
 * ourselves. Kept as an explicit opt-in so no other value can slip through raw.
 */
export function fillTemplateWithHtml(
  template: string,
  vars: TemplateVars,
  rawKey: string,
  rawValue: string,
): string {
  const filled = fillTemplate(template, vars);
  return filled.replace(new RegExp(`\\{\\{\\s*${rawKey}\\s*\\}\\}`, 'g'), rawValue);
}

export async function getTemplate(
  workspaceId: string,
  kind: EmailTemplateKind,
): Promise<{ subject: string | null; html: string } | null> {
  const row = await prisma.emailTemplate.findFirst({
    where: { workspaceId, kind, isActive: true },
  });
  if (!row?.html?.trim()) return null;
  return { subject: row.subject, html: row.html };
}

export interface BrandContext {
  businessName: string;
  accentColor?: string | null;
  logoUrl?: string | null;
}

/**
 * Renders one email, preferring the buyer's overrides.
 *
 * Body and shell are independent: a workspace can restyle the wrapper without
 * touching any message, or rewrite one message and keep the standard frame.
 */
export async function renderTransactional(
  workspaceId: string,
  kind: EmailTemplateKind,
  brand: BrandContext,
  fallbackBodyHtml: string,
  vars: TemplateVars,
  cta?: { label: string; url: string },
): Promise<string> {
  const [body, shell] = await Promise.all([
    getTemplate(workspaceId, kind),
    getTemplate(workspaceId, 'shell'),
  ]);

  const bodyHtml = body ? fillTemplate(body.html, vars) : fallbackBodyHtml;

  if (!shell) return renderEmail(brand, bodyHtml, cta);

  return fillTemplateWithHtml(
    shell.html,
    {
      business: brand.businessName,
      logo_url: brand.logoUrl ?? '',
      accent: brand.accentColor ?? '#E8A33D',
      year: new Date().getFullYear(),
    },
    'content',
    bodyHtml,
  );
}

/** Subject override, if the buyer set one. */
export async function renderSubject(
  workspaceId: string,
  kind: EmailTemplateKind,
  fallback: string,
  vars: TemplateVars,
): Promise<string> {
  const row = await getTemplate(workspaceId, kind);
  if (!row?.subject?.trim()) return fallback;
  // Subjects are plain text — strip any tags a paste brought along.
  return fillTemplate(row.subject, vars).replace(/<[^>]*>/g, '').trim() || fallback;
}
