/**
 * Types and provider tables shared by the Settings panels.
 *
 * Kept in one place so adding a provider is a single edit here rather than a
 * change threaded through the panel that renders it, the modal that edits it
 * and the row that tests it.
 */

import type { Role } from '@prisma/client';

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  timezone: string;
  currency: string;
  niche: string | null;
  businessName: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessAddress: string | null;
};

export type Integration = {
  provider: string;
  configured: boolean;
  source: 'workspace' | 'environment';
  fields: Record<string, string>;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
};

export type TeamUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
};

export type Notify = (message: string, tone: 'success' | 'alert') => void;

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  twilio: 'Twilio — voice, SMS, WhatsApp',
  stripe: 'Stripe',
  paystack: 'Paystack',
  smtp: 'Email (SMTP)',
  google_maps: 'Google Maps Places',
  fcm: 'Firebase Cloud Messaging',
};

export type ProviderField = {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'boolean' | 'json';
  hint?: string;
};

export const PROVIDER_FIELDS: Record<string, ProviderField[]> = {
  anthropic: [{ key: 'apiKey', label: 'API key', type: 'password' }],
  openai: [{ key: 'apiKey', label: 'API key', type: 'password' }],
  twilio: [
    { key: 'accountSid', label: 'Account SID' },
    { key: 'authToken', label: 'Auth token', type: 'password' },
    { key: 'phoneNumber', label: 'Phone number' },
  ],
  stripe: [
    { key: 'secretKey', label: 'Secret key', type: 'password' },
    { key: 'webhookSecret', label: 'Webhook signing secret', type: 'password' },
  ],
  paystack: [{ key: 'secretKey', label: 'Secret key', type: 'password' }],
  smtp: [
    { key: 'host', label: 'SMTP host' },
    { key: 'port', label: 'Port' },
    { key: 'secure', label: 'Use TLS', type: 'boolean', hint: 'usually on for port 465' },
    { key: 'user', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'from', label: 'From address' },
  ],
  google_maps: [{ key: 'apiKey', label: 'API key', type: 'password' }],
  // Service-account JSON, pasted whole. The old "Server key" field pointed at
  // an auth scheme Google retired in June 2024.
  fcm: [
    {
      key: 'serviceAccount',
      label: 'Service account JSON',
      type: 'json',
      hint: 'Firebase Console → Project settings → Service accounts → Generate new private key',
    },
  ],
};

/** Callback URLs the buyer has to register with the provider to receive anything. */
export const PROVIDER_WEBHOOKS: Record<string, { label: string; path: string }[]> = {
  twilio: [
    { label: 'A call comes in (HTTP POST)', path: '/api/voice/inbound' },
    { label: 'Call status changes (HTTP POST)', path: '/api/voice/status' },
    { label: 'A message comes in (HTTP POST)', path: '/api/sms/inbound' },
  ],
  stripe: [{ label: 'Endpoint for checkout.session.completed', path: '/api/invoices/webhooks/stripe' }],
  paystack: [{ label: 'Endpoint for charge.success', path: '/api/invoices/webhooks/paystack' }],
};
