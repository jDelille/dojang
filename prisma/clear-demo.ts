import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Removes the template's dental-marketing demo data — `npx tsx prisma/clear-demo.ts`.
 *
 * Keeps users, workspaces, settings, integrations, pipeline stages and pages.
 * Gym data (members, classes, attendance) comes from Odoo, not this database.
 */

const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.$transaction([
    prisma.call.deleteMany(),
    prisma.review.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.retentionRun.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.task.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.deal.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.leadGatherJob.deleteMany(),
    prisma.knowledgeDoc.deleteMany(),
    prisma.usageRecord.deleteMany(),
  ]);
  const names = [
    'calls', 'reviews', 'invoices', 'appointments', 'retentionRuns', 'messages',
    'conversations', 'tasks', 'activities', 'deals', 'contacts', 'leads',
    'leadGatherJobs', 'knowledgeDocs', 'usageRecords',
  ];
  names.forEach((name, i) => console.log(`  ${name}: ${deleted[i].count}`));

  const workspaces = await prisma.workspace.updateMany({
    where: { slug: 'bright-dental' },
    data: {
      name: 'Dojang Demo Academy',
      businessName: 'Dojang Demo Academy',
      businessEmail: null,
      businessPhone: null,
      businessAddress: null,
      niche: 'Martial arts academy',
      services: [],
    },
  });
  console.log(`  workspaces renamed: ${workspaces.count}`);

  const agents = await prisma.aiAgent.updateMany({
    where: { personaPrompt: { contains: 'dental' } },
    data: {
      personaPrompt:
        'You are the front desk assistant for a martial arts academy. Help staff with members, classes, trials and attendance. Never share medical details or information about minors.',
      greeting: "Hi! I'm the academy's front desk assistant. What can I help with?",
    },
  });
  console.log(`  agents updated: ${agents.count}`);
}

main()
  .catch((error) => {
    console.error('Clear failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
