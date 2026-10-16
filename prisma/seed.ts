import { randomBytes } from 'node:crypto';
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { RULE_TEMPLATES } from '../lib/retention';
import { markInstalled } from '../lib/install';
import { STARTER_PAGES } from '../lib/pages';

/**
 * A readable but unguessable password for the seeded demo account.
 * randomBytes, not Math.random — this guards the only account on a fresh
 * install, and Math.random is predictable from a couple of prior outputs.
 */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}


/**
 * Demo data — `npx tsx prisma/seed.ts`.
 *
 * Useful for evaluating the script or recording a demo. It refuses to run
 * against a database that already has users, so it can't clobber a live
 * install by accident.
 */

const prisma = new PrismaClient();

const DEFAULT_STAGES = [
  { key: 'new', name: 'New', order: 0, color: '#5B6472', isWon: false, isLost: false },
  { key: 'contacted', name: 'Contacted', order: 1, color: '#E8A33D', isWon: false, isLost: false },
  { key: 'booked', name: 'Booked', order: 2, color: '#3F7F8F', isWon: false, isLost: false },
  { key: 'won', name: 'Won', order: 3, color: '#3F8F5F', isWon: true, isLost: false },
  { key: 'lost', name: 'Lost', order: 4, color: '#C24E4E', isWon: false, isLost: true },
];

const LEADS = [
  ['Northside Dental Care', '+15125550101', 'Austin', 4.8, 212, 'won'],
  ['Bright Smile Orthodontics', '+15125550102', 'Austin', 4.6, 88, 'booked'],
  ['Lakeway Family Dentistry', '+15125550103', 'Austin', 4.9, 341, 'contacted'],
  ['Cedar Park Dental Group', '+15125550104', 'Cedar Park', 4.3, 57, 'new'],
  ['Riverside Dental Studio', '+15125550105', 'Austin', 4.7, 129, 'new'],
  ['Hill Country Smiles', '+15125550106', 'Dripping Springs', 4.5, 74, 'lost'],
  ['Downtown Dental Loft', '+15125550107', 'Austin', 4.4, 96, 'contacted'],
  ['Westlake Dental Partners', '+15125550108', 'Westlake', 4.9, 268, 'won'],
] as const;

async function main() {
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log('Database already has users — seed skipped so nothing is overwritten.');
    return;
  }

  console.log('Seeding demo data…');

  const workspace = await prisma.workspace.create({
    data: {
      name: 'Bright Dental Marketing',
      slug: 'bright-dental',
      businessName: 'Bright Dental Marketing',
      businessEmail: 'hello@brightdental.example',
      businessPhone: '+15125550100',
      businessAddress: '400 Congress Ave, Austin, TX',
      niche: 'Dental practice marketing',
      timezone: 'America/Chicago',
      currency: 'USD',
      onboardedAt: new Date(),
      services: [
        { name: 'New patient campaign', price: '$1,200/mo' },
        { name: 'Reputation management', price: '$450/mo' },
        { name: 'Website + booking setup', price: 'from $3,500' },
      ],
      businessHours: {
        Monday: { open: '09:00', close: '17:00' },
        Tuesday: { open: '09:00', close: '17:00' },
        Wednesday: { open: '09:00', close: '17:00' },
        Thursday: { open: '09:00', close: '17:00' },
        Friday: { open: '09:00', close: '15:00' },
        Saturday: { closed: true },
        Sunday: { closed: true },
      },
    },
  });

  // Never a hardcoded password. A literal here ships in the source every
  // buyer receives, so every seeded install would share one known login.
  const demoEmail = process.env.DEMO_EMAIL || 'admin@example.com';
  const demoPassword = process.env.DEMO_PASSWORD || generatePassword();
  const generated = !process.env.DEMO_PASSWORD;

  const admin = await prisma.user.create({
    data: {
      email: demoEmail,
      name: 'Demo Admin',
      passwordHash: await bcrypt.hash(demoPassword, 12),
      role: 'super_admin',
      workspaceId: workspace.id,
    },
  });

  await prisma.pipelineStage.createMany({
    data: DEFAULT_STAGES.map((s) => ({ ...s, workspaceId: workspace.id })),
  });

  const agent = await prisma.aiAgent.create({
    data: {
      workspaceId: workspace.id,
      name: 'Front Desk',
      provider: 'claude',
      model: 'claude-opus-5',
      personaPrompt:
        'You handle first contact for a dental marketing agency. Qualify the enquiry (practice size, current patient volume, what they have tried), and book a discovery call when they are ready.',
      greeting: "Hi! I'm the assistant at Bright Dental Marketing. What can I help with?",
      tone: 'professional',
      channels: ['chat', 'sms'],
      isActive: true,
      isDefault: true,
      escalationRules: {
        keywords: ['refund', 'complaint', 'cancel my contract', 'speak to a human'],
        afterTurns: 8,
      },
    },
  });

  await prisma.knowledgeDoc.create({
    data: {
      workspaceId: workspace.id,
      agentId: agent.id,
      title: 'Frequently asked questions',
      kind: 'faq',
      content: [
        'Q: How long is the contract?',
        'A: Month to month after the first 90 days.',
        '',
        'Q: Do you work with practices outside Texas?',
        'A: Yes, we work with practices anywhere in the US.',
        '',
        'Q: How quickly do we see new patients?',
        'A: Most practices see their first booked new patient within 3 weeks of launch.',
      ].join('\n'),
      tokens: 60,
    },
  });

  const stages = await prisma.pipelineStage.findMany({ where: { workspaceId: workspace.id } });
  const stageByKey = new Map(stages.map((s) => [s.key, s]));

  // Kept so the invoice / appointment / call demo data below can hang off
  // real customers rather than inventing a second, disconnected set.
  const customers: { id: string; name: string; phone: string; won: boolean }[] = [];

  for (const [name, phone, city, rating, reviews, status] of LEADS) {
    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        source: 'maps',
        businessName: name,
        phone,
        city,
        country: 'United States',
        niche: 'dental clinics',
        category: 'dentist',
        rating,
        reviewCount: reviews,
        status: status as never,
        googlePlaceId: `demo-${phone}`,
        // Spread creation over the last month so the charts have a shape.
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 28) * 86_400_000),
      },
    });

    if (status !== 'new') {
      const contact = await prisma.contact.create({
        data: {
          workspaceId: workspace.id,
          leadId: lead.id,
          name: name,
          phone,
          email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
          company: name,
          tags: status === 'won' ? ['customer'] : ['prospect'],
          lastActivityAt: new Date(Date.now() - Math.floor(Math.random() * 20) * 86_400_000),
        },
      });

      customers.push({ id: contact.id, name, phone, won: status === 'won' });

      const stage =
        stageByKey.get(status === 'won' ? 'won' : status === 'lost' ? 'lost' : status) ??
        stages[0];

      await prisma.deal.create({
        data: {
          workspaceId: workspace.id,
          contactId: contact.id,
          stageId: stage.id,
          title: `${name} — new patient campaign`,
          value: 1200 + Math.floor(Math.random() * 8) * 450,
          status: status === 'won' ? 'won' : status === 'lost' ? 'lost' : 'open',
          closedAt: status === 'won' || status === 'lost' ? new Date() : null,
        },
      });

      const conversation = await prisma.conversation.create({
        data: {
          workspaceId: workspace.id,
          contactId: contact.id,
          agentId: agent.id,
          channel: 'chat',
          subject: 'Website chat',
        },
      });

      await prisma.message.createMany({
        data: [
          {
            conversationId: conversation.id,
            direction: 'in',
            sender: 'contact',
            body: 'Hi, we are looking to get more new patients. What do you charge?',
          },
          {
            conversationId: conversation.id,
            direction: 'out',
            sender: 'ai',
            body: 'Happy to help. Our new patient campaigns start at $1,200 a month, and most practices see their first booked patient within about three weeks. How many new patients are you seeing now?',
          },
        ],
      });
    }
  }

  for (const template of RULE_TEMPLATES.slice(0, 2)) {
    await prisma.retentionRule.create({
      data: {
        workspaceId: workspace.id,
        name: template.name,
        description: template.description,
        triggerType: template.triggerType,
        triggerConfig: template.triggerConfig as never,
        steps: template.steps as never,
        isActive: false,
      },
    });
  }

  await prisma.review.createMany({
    data: [
      {
        workspaceId: workspace.id,
        source: 'google',
        externalId: 'demo-1',
        authorName: 'Dr. Alan Reyes',
        rating: 5,
        body: 'Bright Dental doubled our new patient bookings in two months. Genuinely responsive team.',
        status: 'new',
      },
      {
        workspaceId: workspace.id,
        source: 'google',
        externalId: 'demo-2',
        authorName: 'Priya Nair',
        rating: 3,
        body: 'Results are good but reporting was slow to arrive in the first month.',
        status: 'new',
      },
    ],
  });


  // ── Invoices ──────────────────────────────────────────────────────────────
  // Won customers get a paid invoice, the booked one an outstanding invoice,
  // so revenue attribution, lifetime value and the overdue tile all have
  // something real to show on a fresh install.
  const DAY = 86_400_000;
  let invoiceSeq = 0;

  for (const customer of customers) {
    if (!customer.won) continue;

    const subtotal = 1200 + Math.floor(Math.random() * 6) * 250;
    const taxRate = 8.25;
    const amount = Math.round(subtotal * (1 + taxRate / 100) * 100) / 100;
    const paidAt = new Date(Date.now() - (4 + Math.floor(Math.random() * 20)) * DAY);

    await prisma.invoice.create({
      data: {
        workspaceId: workspace.id,
        contactId: customer.id,
        number: `INV-${String(++invoiceSeq).padStart(4, '0')}`,
        lineItems: [
          { description: 'New patient campaign — monthly management', quantity: 1, unitPrice: subtotal },
        ],
        subtotal,
        taxRate,
        amount,
        currency: workspace.currency,
        status: 'paid',
        sentAt: new Date(paidAt.getTime() - 3 * DAY),
        paidAt,
        createdAt: new Date(paidAt.getTime() - 4 * DAY),
      },
    });
  }

  // One still owing, and one genuinely overdue — an all-paid demo hides half
  // the invoice UI (the chase-up states).
  const owing = customers.filter((c) => !c.won).slice(0, 2);
  for (const [index, customer] of owing.entries()) {
    const overdue = index === 0;
    const subtotal = 950 + index * 400;
    const amount = Math.round(subtotal * 1.0825 * 100) / 100;
    const sentAt = new Date(Date.now() - (overdue ? 26 : 5) * DAY);

    await prisma.invoice.create({
      data: {
        workspaceId: workspace.id,
        contactId: customer.id,
        number: `INV-${String(++invoiceSeq).padStart(4, '0')}`,
        lineItems: [
          { description: 'Discovery workshop and campaign setup', quantity: 1, unitPrice: subtotal },
        ],
        subtotal,
        taxRate: 8.25,
        amount,
        currency: workspace.currency,
        status: overdue ? 'overdue' : 'sent',
        dueAt: new Date(sentAt.getTime() + 14 * DAY),
        sentAt,
        createdAt: sentAt,
      },
    });
  }

  // ── Appointments ──────────────────────────────────────────────────────────
  // One in the past, two ahead, so the calendar is neither empty nor entirely
  // historical whichever day the buyer installs.
  const APPOINTMENTS: [number, number, string, string, string][] = [
    [-6, 10, 'Kick-off call', 'Zoom', 'completed'],
    [2, 14, 'Campaign review', 'Zoom', 'confirmed'],
    [9, 11, 'Quarterly strategy session', 'Their office', 'scheduled'],
  ];

  for (const [offsetDays, hour, title, location, status] of APPOINTMENTS) {
    const customer = customers[Math.abs(offsetDays) % customers.length];
    if (!customer) continue;

    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + offsetDays);
    startsAt.setHours(hour, 0, 0, 0);

    await prisma.appointment.create({
      data: {
        workspaceId: workspace.id,
        contactId: customer.id,
        title: `${title} — ${customer.name}`,
        location,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 45 * 60_000),
        status: status as never,
        bookedByAgent: offsetDays > 0,
        createdAt: new Date(startsAt.getTime() - 5 * DAY),
      },
    });
  }

  // ── Calls ─────────────────────────────────────────────────────────────────
  // Including one missed call with a text-back, since that is the headline
  // behavior of the voice module and it is invisible without an example.
  const answered = customers[0];
  const missedBy = customers[1];

  if (answered) {
    await prisma.call.create({
      data: {
        workspaceId: workspace.id,
        contactId: answered.id,
        direction: 'in',
        fromNumber: answered.phone,
        toNumber: workspace.businessPhone ?? '+15125550100',
        durationSeconds: 214,
        status: 'completed',
        transcript:
          'Caller: Hi, I saw your campaign results and wanted to ask about pricing.\nAgent: Happy to help. Our new patient campaigns start at $1,200 a month.\nCaller: And how quickly do practices usually see bookings?\nAgent: Most see their first booked patient within about three weeks.\nCaller: That works. Can you send something over?\nAgent: Sending it now — you should have it within the hour.',
        summary:
          'Asked about pricing and time to first booking. Quoted $1,200/mo and a ~3 week ramp. Agreed to receive a proposal by email.',
        createdAt: new Date(Date.now() - 2 * DAY),
      },
    });
  }

  if (missedBy) {
    await prisma.call.create({
      data: {
        workspaceId: workspace.id,
        contactId: missedBy.id,
        direction: 'in',
        fromNumber: missedBy.phone,
        toNumber: workspace.businessPhone ?? '+15125550100',
        durationSeconds: 0,
        status: 'no-answer',
        missed: true,
        textBackSent: true,
        createdAt: new Date(Date.now() - 1 * DAY),
      },
    });
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  // One overdue, one due today, one ahead — the three buckets the Tasks page
  // groups by, so the grouping is visible immediately.
  const TASKS: [string, number][] = [
    ['Chase the overdue invoice from the discovery workshop', -2],
    ['Send the campaign review deck before this afternoon', 0],
    ['Prepare the quarterly strategy session agenda', 6],
  ];

  for (const [index, [title, offsetDays]] of TASKS.entries()) {
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + offsetDays);
    dueAt.setHours(9, 0, 0, 0);

    await prisma.task.create({
      data: {
        workspaceId: workspace.id,
        contactId: customers[index % Math.max(1, customers.length)]?.id ?? null,
        assigneeId: admin.id,
        title,
        dueAt,
      },
    });
  }

  // Public pages. Seeded here as well as on first Super Admin visit, because
  // a fresh install otherwise has no privacy policy or terms until someone
  // happens to open that screen — and the site footer links nowhere.
  await prisma.sitePage.createMany({
    data: STARTER_PAGES.map((page, index) => ({ ...page, sortOrder: index, isPublished: true })),
    skipDuplicates: true,
  });

  // Seeding produces a working install — admin user, workspace, pipeline and
  // agent all exist. Without this the installer's own record stays missing and
  // Super Admin reports "Installer has not been completed" forever.
  await markInstalled();

  console.log('');
  console.log('  Seeded.');
  console.log(`  Sign in with:  ${demoEmail}  /  ${demoPassword}`);
  if (generated) {
    console.log('  That password was generated for this run and is not stored anywhere');
    console.log('  else. Copy it now, or set DEMO_PASSWORD in .env before re-seeding.');
  }
  console.log('  Change it immediately if this is not a throwaway install.');
  console.log('');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
