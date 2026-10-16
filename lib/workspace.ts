import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';
import type { Contact, Prisma } from '@prisma/client';

/** Workspace provisioning + shared CRM helpers. */

export const DEFAULT_STAGES = [
  { key: 'new', name: 'New', order: 0, color: '#5B6472' },
  { key: 'contacted', name: 'Contacted', order: 1, color: '#E8A33D' },
  { key: 'booked', name: 'Booked', order: 2, color: '#3F7F8F' },
  { key: 'won', name: 'Won', order: 3, color: '#3F8F5F', isWon: true },
  { key: 'lost', name: 'Lost', order: 4, color: '#C24E4E', isLost: true },
] as const;

const DEFAULT_AGENT_PROMPT = `You handle first contact for this business. Your job is to answer questions about
what the business does, qualify the enquiry (what they need, when they need it,
how to reach them), and book them in when they're ready.

If someone asks for something you can't confirm from the business details —
a firm quote, an unusual request, anything about an existing order — take their
details and tell them a team member will follow up.`;

export async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'workspace';
  let candidate = root;
  let n = 1;

  while (await prisma.workspace.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}

export type ProvisionInput = {
  name: string;
  niche?: string | null;
  timezone?: string;
  currency?: string;
  parentId?: string | null;
  businessName?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
};

/**
 * Creates a workspace with the default pipeline and a starter AI agent.
 * A workspace without stages breaks the Kanban board, so both are created in
 * one transaction.
 */
export async function provisionWorkspace(input: ProvisionInput) {
  const slug = await uniqueSlug(input.name);

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: input.name,
        slug,
        niche: input.niche ?? null,
        timezone: input.timezone ?? 'UTC',
        currency: input.currency ?? 'USD',
        parentId: input.parentId ?? null,
        businessName: input.businessName ?? input.name,
        businessEmail: input.businessEmail ?? null,
        businessPhone: input.businessPhone ?? null,
      },
    });

    await tx.pipelineStage.createMany({
      data: DEFAULT_STAGES.map((stage) => ({
        workspaceId: workspace.id,
        key: stage.key,
        name: stage.name,
        order: stage.order,
        color: stage.color,
        isWon: 'isWon' in stage ? stage.isWon : false,
        isLost: 'isLost' in stage ? stage.isLost : false,
      })),
    });

    await tx.aiAgent.create({
      data: {
        workspaceId: workspace.id,
        name: 'Front Desk',
        provider: 'claude',
        model: 'claude-opus-5',
        personaPrompt: DEFAULT_AGENT_PROMPT,
        greeting: `Hi! I'm the assistant for ${input.businessName ?? input.name}. How can I help?`,
        tone: 'professional',
        channels: ['chat'],
        isActive: true,
        isDefault: true,
        escalationRules: {
          keywords: ['refund', 'complaint', 'lawyer', 'cancel my', 'speak to a human'],
          afterTurns: 8,
        },
      },
    });

    return workspace;
  });
}

/**
 * Finds an existing contact by phone/email or creates one. Every inbound
 * channel funnels through here so one person doesn't fragment into three
 * contacts across SMS, chat and email.
 */
export async function upsertContact(
  workspaceId: string,
  input: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    company?: string | null;
    leadId?: string | null;
    tags?: string[];
  },
): Promise<Contact> {
  const or: Prisma.ContactWhereInput[] = [];
  if (input.phone) or.push({ phone: input.phone });
  if (input.email) or.push({ email: input.email.toLowerCase() });

  if (or.length) {
    const existing = await prisma.contact.findFirst({ where: { workspaceId, OR: or } });
    if (existing) {
      const patch: Prisma.ContactUpdateInput = { lastActivityAt: new Date() };
      if (!existing.name && input.name) patch.name = input.name;
      if (!existing.phone && input.phone) patch.phone = input.phone;
      if (!existing.email && input.email) patch.email = input.email.toLowerCase();
      if (!existing.company && input.company) patch.company = input.company;
      if (!existing.leadId && input.leadId) patch.lead = { connect: { id: input.leadId } };

      return prisma.contact.update({ where: { id: existing.id }, data: patch });
    }
  }

  return prisma.contact.create({
    data: {
      workspaceId,
      name: input.name || input.email || input.phone || 'Unknown contact',
      phone: input.phone ?? null,
      email: input.email?.toLowerCase() ?? null,
      company: input.company ?? null,
      leadId: input.leadId ?? null,
      tags: input.tags ?? [],
      lastActivityAt: new Date(),
    },
  });
}

export async function logActivity(input: {
  workspaceId: string;
  contactId?: string | null;
  userId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  meta?: Record<string, unknown>;
}) {
  const [activity] = await Promise.all([
    prisma.activity.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: input.contactId ?? null,
        userId: input.userId ?? null,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        meta: (input.meta ?? {}) as never,
      },
    }),
    input.contactId
      ? prisma.contact
          .update({ where: { id: input.contactId }, data: { lastActivityAt: new Date() } })
          .catch(() => undefined)
      : Promise.resolve(),
  ]);

  return activity;
}

/** Next invoice number for a workspace: INV-0001, INV-0002, … */
/**
 * Next invoice number for a workspace: INV-0001, INV-0002, …
 *
 * Derived from the highest number already issued, not from the row count —
 * counting collides with the `@@unique([workspaceId, number])` constraint as
 * soon as any invoice is deleted, which the UI allows.
 */
export async function nextInvoiceNumber(workspaceId: string, isEstimate = false): Promise<string> {
  const prefix = isEstimate ? 'EST' : 'INV';

  const latest = await prisma.invoice.findFirst({
    where: { workspaceId, isEstimate },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const highest = latest ? Number.parseInt(latest.number.replace(`${prefix}-`, ''), 10) : 0;
  const next = Number.isFinite(highest) ? highest + 1 : 1;

  return `${prefix}-${String(next).padStart(4, '0')}`;
}

export async function ensureStages(workspaceId: string) {
  const count = await prisma.pipelineStage.count({ where: { workspaceId } });
  if (count > 0) return;

  await prisma.pipelineStage.createMany({
    data: DEFAULT_STAGES.map((stage) => ({
      workspaceId,
      key: stage.key,
      name: stage.name,
      order: stage.order,
      color: stage.color,
      isWon: 'isWon' in stage ? stage.isWon : false,
      isLost: 'isLost' in stage ? stage.isLost : false,
    })),
  });
}
