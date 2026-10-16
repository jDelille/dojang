-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('super_admin', 'agency_admin', 'workspace_admin', 'staff');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('claude', 'openai');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('maps', 'manual', 'inbound', 'import');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'booked', 'won', 'lost');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('open', 'won', 'lost');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('chat', 'voice', 'sms', 'email', 'whatsapp', 'facebook', 'instagram');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('ai', 'human', 'contact', 'system');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('no_activity', 'lead_created', 'lead_status_changed', 'appointment_booked', 'appointment_completed', 'invoice_paid', 'missed_call', 'tag_added', 'manual');

-- CreateEnum
CREATE TYPE "StepAction" AS ENUM ('send_email', 'send_sms', 'send_push', 'add_tag', 'remove_tag', 'change_stage', 'create_task', 'notify_team', 'request_review', 'wait');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('new', 'drafted', 'approved', 'responded', 'ignored');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'overdue', 'void');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('stripe', 'paystack', 'crypto', 'manual');

-- CreateEnum
CREATE TYPE "CryptoAsset" AS ENUM ('BTC', 'ETH', 'USDT_TRON', 'USDC_TRON');

-- CreateEnum
CREATE TYPE "EmailTemplateKind" AS ENUM ('shell', 'invoice', 'appointment_reminder', 'review_request', 'retention', 'inbox_reply');

-- CreateEnum
CREATE TYPE "CryptoNetwork" AS ENUM ('mainnet', 'testnet');

-- CreateEnum
CREATE TYPE "CryptoPaymentStatus" AS ENUM ('awaiting', 'detected', 'confirmed', 'underpaid', 'expired');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('unverified', 'active', 'invalid', 'domain_mismatch');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('ai_tokens_in', 'ai_tokens_out', 'sms_sent', 'calls_minutes', 'emails_sent', 'push_sent', 'leads_gathered');

-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('google', 'outlook');

-- CreateTable
CREATE TABLE "site_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "showInFooter" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "EmailTemplateKind" NOT NULL,
    "subject" TEXT,
    "html" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_wallets" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "asset" "CryptoAsset" NOT NULL,
    "network" "CryptoNetwork" NOT NULL DEFAULT 'mainnet',
    "extendedKey" TEXT NOT NULL,
    "label" TEXT,
    "nextIndex" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crypto_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_payments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "asset" "CryptoAsset" NOT NULL,
    "network" "CryptoNetwork" NOT NULL DEFAULT 'mainnet',
    "address" TEXT NOT NULL,
    "derivationIndex" INTEGER NOT NULL,
    "amount" DECIMAL(30,18) NOT NULL,
    "fiatAmount" DECIMAL(14,2) NOT NULL,
    "fiatCurrency" TEXT NOT NULL,
    "rate" DECIMAL(30,12) NOT NULL,
    "status" "CryptoPaymentStatus" NOT NULL DEFAULT 'awaiting',
    "receivedAmount" DECIMAL(30,18) NOT NULL DEFAULT 0,
    "baselineAmount" DECIMAL(30,18) NOT NULL DEFAULT 0,
    "txHash" TEXT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "detectedAtBlock" INTEGER,
    "quotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crypto_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "customDomain" TEXT,
    "logoUrl" TEXT,
    "accentColor" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'standard',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "parentId" TEXT,
    "businessName" TEXT,
    "businessPhone" TEXT,
    "businessEmail" TEXT,
    "businessAddress" TEXT,
    "businessHours" JSONB,
    "services" JSONB,
    "niche" TEXT,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "role" "Role" NOT NULL DEFAULT 'staff',
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT,
    "credentials" TEXT NOT NULL,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'claude',
    "model" TEXT NOT NULL DEFAULT 'claude-opus-5',
    "personaPrompt" TEXT NOT NULL,
    "greeting" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "escalationRules" JSONB,
    "channels" TEXT[] DEFAULT ARRAY['chat']::TEXT[],
    "temperature" DOUBLE PRECISION,
    "maxTokens" INTEGER NOT NULL DEFAULT 2048,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_docs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'doc',
    "content" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL DEFAULT 'manual',
    "businessName" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "niche" TEXT,
    "category" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "googlePlaceId" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "ownerId" TEXT,
    "gatherJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "company" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB,
    "timezone" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "optedOutSms" BOOLEAN NOT NULL DEFAULT false,
    "optedOutEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "DealStatus" NOT NULL DEFAULT 'open',
    "order" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "agentId" TEXT,
    "channel" "Channel" NOT NULL,
    "subject" TEXT,
    "externalId" TEXT,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "needsHuman" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "sender" "SenderType" NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "meta" JSONB,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "direction" "Direction" NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "providerCallSid" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "recordingUrl" TEXT,
    "transcript" TEXT,
    "summary" TEXT,
    "missed" BOOLEAN NOT NULL DEFAULT false,
    "textBackSent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_accounts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "calendarId" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "calendarAccountId" TEXT,
    "calendarEventId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'scheduled',
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "bookedByAgent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_rules" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" "TriggerType" NOT NULL,
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "audience" JSONB,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "status" "RunStatus" NOT NULL DEFAULT 'pending',
    "nextRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isDryRun" BOOLEAN NOT NULL DEFAULT false,
    "log" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "contactId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "fcmToken" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'google',
    "externalId" TEXT,
    "authorName" TEXT,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "aiResponseDraft" TEXT,
    "publishedReply" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'new',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "isEstimate" BOOLEAN NOT NULL DEFAULT false,
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'stripe',
    "payLink" TEXT,
    "externalRef" TEXT,
    "dueAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_gather_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "niche" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL DEFAULT 50,
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "savedCount" INTEGER NOT NULL DEFAULT 0,
    "dupeCount" INTEGER NOT NULL DEFAULT 0,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_gather_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "day" DATE NOT NULL,
    "meta" JSONB,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "envatoPurchaseCode" TEXT NOT NULL,
    "buyerName" TEXT,
    "itemName" TEXT,
    "supportedUntil" TIMESTAMP(3),
    "domain" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "status" "LicenseStatus" NOT NULL DEFAULT 'unverified',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_pages_slug_key" ON "site_pages"("slug");

-- CreateIndex
CREATE INDEX "site_pages_isPublished_sortOrder_idx" ON "site_pages"("isPublished", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_workspaceId_kind_key" ON "email_templates"("workspaceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_wallets_workspaceId_asset_key" ON "crypto_wallets"("workspaceId", "asset");

-- CreateIndex
CREATE INDEX "crypto_payments_workspaceId_status_idx" ON "crypto_payments"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "crypto_payments_status_expiresAt_idx" ON "crypto_payments"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "crypto_payments_invoiceId_idx" ON "crypto_payments"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_payments_address_asset_key" ON "crypto_payments"("address", "asset");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_customDomain_key" ON "workspaces"("customDomain");

-- CreateIndex
CREATE INDEX "workspaces_parentId_idx" ON "workspaces"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_workspaceId_idx" ON "users"("workspaceId");

-- CreateIndex
CREATE INDEX "integrations_workspaceId_idx" ON "integrations"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_workspaceId_provider_key" ON "integrations"("workspaceId", "provider");

-- CreateIndex
CREATE INDEX "ai_agents_workspaceId_idx" ON "ai_agents"("workspaceId");

-- CreateIndex
CREATE INDEX "knowledge_docs_workspaceId_idx" ON "knowledge_docs"("workspaceId");

-- CreateIndex
CREATE INDEX "knowledge_docs_agentId_idx" ON "knowledge_docs"("agentId");

-- CreateIndex
CREATE INDEX "leads_workspaceId_status_idx" ON "leads"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "leads_workspaceId_phone_idx" ON "leads"("workspaceId", "phone");

-- CreateIndex
CREATE INDEX "leads_gatherJobId_idx" ON "leads"("gatherJobId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_workspaceId_googlePlaceId_key" ON "leads"("workspaceId", "googlePlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_leadId_key" ON "contacts"("leadId");

-- CreateIndex
CREATE INDEX "contacts_workspaceId_idx" ON "contacts"("workspaceId");

-- CreateIndex
CREATE INDEX "contacts_workspaceId_phone_idx" ON "contacts"("workspaceId", "phone");

-- CreateIndex
CREATE INDEX "contacts_workspaceId_email_idx" ON "contacts"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "pipeline_stages_workspaceId_idx" ON "pipeline_stages"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_workspaceId_key_key" ON "pipeline_stages"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "deals_workspaceId_stageId_idx" ON "deals"("workspaceId", "stageId");

-- CreateIndex
CREATE INDEX "deals_contactId_idx" ON "deals"("contactId");

-- CreateIndex
CREATE INDEX "activities_workspaceId_createdAt_idx" ON "activities"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "activities_contactId_createdAt_idx" ON "activities"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "tasks_workspaceId_idx" ON "tasks"("workspaceId");

-- CreateIndex
CREATE INDEX "conversations_workspaceId_lastMessageAt_idx" ON "conversations"("workspaceId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "conversations_contactId_idx" ON "conversations"("contactId");

-- CreateIndex
CREATE INDEX "conversations_externalId_idx" ON "conversations"("externalId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "calls_providerCallSid_key" ON "calls"("providerCallSid");

-- CreateIndex
CREATE INDEX "calls_workspaceId_createdAt_idx" ON "calls"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "calls_contactId_idx" ON "calls"("contactId");

-- CreateIndex
CREATE INDEX "calendar_accounts_workspaceId_idx" ON "calendar_accounts"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_accounts_workspaceId_provider_accountEmail_key" ON "calendar_accounts"("workspaceId", "provider", "accountEmail");

-- CreateIndex
CREATE INDEX "appointments_workspaceId_startsAt_idx" ON "appointments"("workspaceId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_contactId_idx" ON "appointments"("contactId");

-- CreateIndex
CREATE INDEX "retention_rules_workspaceId_isActive_idx" ON "retention_rules"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "retention_runs_workspaceId_status_idx" ON "retention_runs"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "retention_runs_nextRunAt_idx" ON "retention_runs"("nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "retention_runs_ruleId_contactId_key" ON "retention_runs"("ruleId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_workspaceId_idx" ON "push_subscriptions"("workspaceId");

-- CreateIndex
CREATE INDEX "reviews_workspaceId_status_idx" ON "reviews"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_workspaceId_source_externalId_key" ON "reviews"("workspaceId", "source", "externalId");

-- CreateIndex
CREATE INDEX "invoices_workspaceId_status_idx" ON "invoices"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "invoices_contactId_idx" ON "invoices"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_workspaceId_number_key" ON "invoices"("workspaceId", "number");

-- CreateIndex
CREATE INDEX "lead_gather_jobs_workspaceId_createdAt_idx" ON "lead_gather_jobs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_records_workspaceId_day_idx" ON "usage_records"("workspaceId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_workspaceId_metric_day_key" ON "usage_records"("workspaceId", "metric", "day");

-- CreateIndex
CREATE UNIQUE INDEX "licenses_workspaceId_key" ON "licenses"("workspaceId");

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_wallets" ADD CONSTRAINT "crypto_wallets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_payments" ADD CONSTRAINT "crypto_payments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_payments" ADD CONSTRAINT "crypto_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_payments" ADD CONSTRAINT "crypto_payments_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "crypto_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_gatherJobId_fkey" FOREIGN KEY ("gatherJobId") REFERENCES "lead_gather_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_accounts" ADD CONSTRAINT "calendar_accounts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_calendarAccountId_fkey" FOREIGN KEY ("calendarAccountId") REFERENCES "calendar_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_rules" ADD CONSTRAINT "retention_rules_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_runs" ADD CONSTRAINT "retention_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_runs" ADD CONSTRAINT "retention_runs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "retention_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_runs" ADD CONSTRAINT "retention_runs_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_gather_jobs" ADD CONSTRAINT "lead_gather_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

