import { z } from 'zod';

/** Request schemas shared by the route handlers. */

export const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
  workspaceName: z.string().min(1).max(120).optional(),
});

export const workspaceCreateSchema = z.object({
  name: z.string().min(1).max(120),
  niche: z.string().max(120).optional().nullable(),
  timezone: z.string().max(64).optional(),
  currency: z.string().length(3).optional(),
  parentId: z.string().optional().nullable(),
  adminEmail: z.string().email().optional(),
  adminPassword: z.string().min(8).optional(),
});

export const workspaceUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  customDomain: z.string().max(200).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color, e.g. #E8A33D.')
    .optional()
    .nullable(),
  timezone: z.string().max(64).optional(),
  currency: z.string().length(3).optional(),
  niche: z.string().max(120).optional().nullable(),
  businessName: z.string().max(160).optional().nullable(),
  businessPhone: z.string().max(40).optional().nullable(),
  businessEmail: z.string().email().max(160).optional().nullable().or(z.literal('')),
  businessAddress: z.string().max(400).optional().nullable(),
  businessHours: z.record(z.unknown()).optional().nullable(),
  services: z.array(z.unknown()).optional().nullable(),
});

export const leadCreateSchema = z.object({
  businessName: z.string().min(1).max(200),
  contactName: z.string().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  address: z.string().max(400).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  niche: z.string().max(120).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  source: z.enum(['maps', 'manual', 'inbound', 'import']).optional(),
  status: z.enum(['new', 'contacted', 'booked', 'won', 'lost']).optional(),
  ownerId: z.string().optional().nullable(),
});

export const leadUpdateSchema = leadCreateSchema.partial();

export const leadGatherSchema = z.object({
  countries: z.array(z.string().min(1).max(120)).min(1, 'Pick at least one region.').max(20),
  niche: z.string().min(1, 'Describe the kind of business to find.').max(160),
  // `.default()` keeps the field optional on input but always present on output.
  targetCount: z.number().int().min(1).max(500).optional().default(50),
});

export const contactCreateSchema = z.object({
  name: z.string().min(1).max(160),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  company: z.string().max(160).optional().nullable(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  customFields: z.record(z.unknown()).optional().nullable(),
  optedOutSms: z.boolean().optional(),
  optedOutEmail: z.boolean().optional(),
});

export const contactUpdateSchema = contactCreateSchema.partial();

export const dealCreateSchema = z.object({
  contactId: z.string().min(1),
  stageId: z.string().min(1).optional(),
  title: z.string().min(1).max(200),
  value: z.number().min(0).max(1_000_000_000).optional(),
  currency: z.string().length(3).optional(),
});

export const dealUpdateSchema = z.object({
  stageId: z.string().optional(),
  title: z.string().min(1).max(200).optional(),
  value: z.number().min(0).optional(),
  status: z.enum(['open', 'won', 'lost']).optional(),
  order: z.number().int().optional(),
});

export const agentCreateSchema = z.object({
  name: z.string().min(1).max(120),
  provider: z.enum(['claude', 'openai']),
  model: z.string().min(1).max(80),
  personaPrompt: z.string().max(20_000),
  greeting: z.string().max(1000).optional().nullable(),
  tone: z.string().max(40).optional(),
  channels: z.array(z.string().max(20)).optional(),
  maxTokens: z.number().int().min(128).max(8192).optional(),
  temperature: z.number().min(0).max(2).optional().nullable(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  escalationRules: z
    .object({
      keywords: z.array(z.string().max(60)).max(40).optional(),
      afterTurns: z.number().int().min(0).max(100).optional(),
      instructions: z.string().max(2000).optional(),
    })
    .optional()
    .nullable(),
});

export const agentUpdateSchema = agentCreateSchema.partial();

export const agentChatSchema = z.object({
  message: z.string().min(1).max(8000),
  conversationId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  channel: z.enum(['chat', 'sms', 'email', 'whatsapp', 'voice']).optional(),
});

export const knowledgeDocSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(['doc', 'faq', 'pricing', 'policy']).optional(),
  content: z.string().min(1).max(200_000),
  agentId: z.string().optional().nullable(),
  sourceUrl: z.string().max(500).optional().nullable(),
});

const retentionStepSchema = z.object({
  action: z.enum([
    'send_email',
    'send_sms',
    'send_push',
    'add_tag',
    'remove_tag',
    'change_stage',
    'create_task',
    'notify_team',
    'request_review',
    'wait',
  ]),
  delayMinutes: z.number().int().min(0).max(525_600).optional(),
  subject: z.string().max(300).optional(),
  body: z.string().max(10_000).optional(),
  tag: z.string().max(60).optional(),
  stageKey: z.string().max(60).optional(),
  skipIfReplied: z.boolean().optional(),
  requireOpened: z.boolean().optional(),
});

export const retentionRuleSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional().nullable(),
  triggerType: z.enum([
    'no_activity',
    'lead_created',
    'lead_status_changed',
    'appointment_booked',
    'appointment_completed',
    'invoice_paid',
    'missed_call',
    'tag_added',
    'manual',
  ]),
  triggerConfig: z.record(z.unknown()).optional(),
  audience: z
    .object({
      tags: z.array(z.string().max(40)).optional(),
      statuses: z.array(z.string().max(40)).optional(),
    })
    .optional()
    .nullable(),
  steps: z.array(retentionStepSchema).max(20),
  isActive: z.boolean().optional(),
});

export const retentionRuleUpdateSchema = retentionRuleSchema.partial();

export const appointmentCreateSchema = z.object({
  contactId: z.string().min(1),
  title: z.string().min(1).max(200),
  notes: z.string().max(4000).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
});

export const appointmentUpdateSchema = appointmentCreateSchema.partial().extend({
  contactId: z.string().optional(),
});

export const reviewUpdateSchema = z.object({
  aiResponseDraft: z.string().max(4000).optional().nullable(),
  publishedReply: z.string().max(4000).optional().nullable(),
  status: z.enum(['new', 'drafted', 'approved', 'responded', 'ignored']).optional(),
});

const lineItemSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().min(0).max(100_000),
  unitPrice: z.number().min(0).max(10_000_000),
});

export const invoiceCreateSchema = z.object({
  contactId: z.string().min(1),
  isEstimate: z.boolean().optional(),
  lineItems: z.array(lineItemSchema).min(1, 'Add at least one line item.').max(50),
  taxRate: z.number().min(0).max(100).optional(),
  currency: z.string().length(3).optional(),
  provider: z.enum(['stripe', 'paystack', 'manual']).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const invoiceUpdateSchema = invoiceCreateSchema.partial().extend({
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'void']).optional(),
});

export const inboxSendSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().min(1).max(8000),
  channel: z.enum(['chat', 'sms', 'email', 'whatsapp']).optional(),
});

export const integrationSaveSchema = z.object({
  provider: z.enum([
    'anthropic',
    'openai',
    'twilio',
    'stripe',
    'paystack',
    'smtp',
    'google_maps',
    'fcm',
  ]),
  credentials: z.record(z.string()),
  config: z.record(z.unknown()).optional(),
});

export const teamInviteSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  role: z.enum(['super_admin', 'agency_admin', 'workspace_admin', 'staff']),
  password: z.string().min(8).max(200),
});

export const licenseVerifySchema = z.object({
  // Envato codes are 36 chars; signed direct keys run to ~250.
  purchaseCode: z.string().min(1).max(400),
  domain: z.string().max(200).optional(),
});

export const installSchema = z.object({
  adminName: z.string().min(1).max(120),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8, 'Use at least 8 characters.').max(200),
  workspaceName: z.string().min(1).max(120),
  niche: z.string().max(120).optional(),
  purchaseCode: z.string().max(400).optional(),
  anthropicKey: z.string().max(200).optional(),
  openaiKey: z.string().max(200).optional(),
});

export const widgetMessageSchema = z.object({
  workspaceSlug: z.string().min(1).max(80),
  sessionId: z.string().min(8).max(120),
  message: z.string().min(1).max(4000),
  visitor: z
    .object({
      name: z.string().max(120).optional(),
      email: z.string().max(200).optional(),
      phone: z.string().max(40).optional(),
    })
    .optional(),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  fcmToken: z.string().max(400).optional(),
});
