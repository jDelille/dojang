import { prisma } from '@/lib/db';
import { decryptJson, encryptJson, maskSecret } from '@/lib/crypto';

/**
 * Resolves a workspace's credentials for a provider, falling back to the
 * platform-wide values in .env. Buyers bring their own keys (spec §1), but a
 * single-tenant install can just set them once in the environment.
 */

export type ProviderKey =
  | 'anthropic'
  | 'openai'
  | 'twilio'
  | 'stripe'
  | 'paystack'
  | 'smtp'
  | 'google_maps'
  | 'fcm';

type CredentialBag = Record<string, string>;

const ENV_FALLBACKS: Record<ProviderKey, () => CredentialBag> = {
  anthropic: () => ({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' }),
  openai: () => ({ apiKey: process.env.OPENAI_API_KEY ?? '' }),
  twilio: () => ({
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER ?? '',
  }),
  stripe: () => ({
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  }),
  paystack: () => ({ secretKey: process.env.PAYSTACK_SECRET_KEY ?? '' }),
  smtp: () => ({
    host: process.env.SMTP_HOST ?? '',
    port: process.env.SMTP_PORT ?? '587',
    secure: process.env.SMTP_SECURE ?? 'false',
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? '',
  }),
  google_maps: () => ({ apiKey: process.env.GOOGLE_MAPS_API_KEY ?? '' }),
  // Service-account JSON. The legacy FCM_SERVER_KEY was retired by Google
  // in June 2024 and the endpoint it authenticated no longer exists.
  fcm: () => ({ serviceAccount: process.env.FCM_SERVICE_ACCOUNT ?? '' }),
};

/**
 * The field that decides whether a provider counts as configured. Without
 * this, SMTP looks "configured" purely because `port` defaults to 587.
 */
const PRIMARY_FIELD: Record<ProviderKey, string> = {
  anthropic: 'apiKey',
  openai: 'apiKey',
  twilio: 'accountSid',
  stripe: 'secretKey',
  paystack: 'secretKey',
  smtp: 'host',
  google_maps: 'apiKey',
  fcm: 'serviceAccount',
};

/** Fields that must never leave the server unmasked. */
const SECRET_FIELDS = new Set([
  'apiKey',
  'authToken',
  'secretKey',
  'password',
  'webhookSecret',
  'serverKey',
  'accessToken',
  'refreshToken',
  'clientSecret',
]);

export async function getCredentials(
  workspaceId: string,
  provider: ProviderKey,
): Promise<CredentialBag> {
  const record = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
  });

  const fallback = ENV_FALLBACKS[provider]();

  if (!record || !record.isActive) return fallback;

  try {
    const stored = decryptJson<CredentialBag>(record.credentials);
    // Workspace values win; env fills any gaps the buyer left blank.
    const merged = { ...fallback };
    for (const [k, v] of Object.entries(stored)) {
      if (v !== '' && v != null) merged[k] = v;
    }
    return merged;
  } catch {
    // A key rotation makes old envelopes unreadable — degrade to env rather
    // than taking the whole workspace down.
    return fallback;
  }
}

export async function saveCredentials(
  workspaceId: string,
  provider: ProviderKey,
  credentials: CredentialBag,
  config?: Record<string, unknown>,
) {
  const existing = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
  });

  // Blank fields mean "leave as-is", so a buyer can edit a phone number
  // without re-typing the auth token.
  let merged = credentials;
  if (existing) {
    try {
      const prev = decryptJson<CredentialBag>(existing.credentials);
      merged = { ...prev };
      for (const [k, v] of Object.entries(credentials)) {
        if (v !== '' && v != null) merged[k] = v;
      }
    } catch {
      merged = credentials;
    }
  }

  return prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId, provider } },
    create: {
      workspaceId,
      provider,
      credentials: encryptJson(merged),
      config: (config ?? {}) as never,
    },
    update: {
      credentials: encryptJson(merged),
      ...(config ? { config: config as never } : {}),
    },
  });
}

export async function deleteCredentials(workspaceId: string, provider: ProviderKey) {
  await prisma.integration
    .delete({ where: { workspaceId_provider: { workspaceId, provider } } })
    .catch(() => undefined);
}

/** Masked view for the Settings → Integrations screen. */
export async function listIntegrationStatus(workspaceId: string) {
  const providers = Object.keys(ENV_FALLBACKS) as ProviderKey[];
  const records = await prisma.integration.findMany({ where: { workspaceId } });
  const byProvider = new Map(records.map((r) => [r.provider, r]));

  return Promise.all(
    providers.map(async (provider) => {
      const creds = await getCredentials(workspaceId, provider);
      const record = byProvider.get(provider);
      const masked: CredentialBag = {};
      for (const [k, v] of Object.entries(creds)) {
        masked[k] = SECRET_FIELDS.has(k) ? maskSecret(v) : v;
      }
      return {
        provider,
        configured: Boolean(creds[PRIMARY_FIELD[provider]]),
        source: record ? ('workspace' as const) : ('environment' as const),
        fields: masked,
        lastTestAt: record?.lastTestAt ?? null,
        lastTestOk: record?.lastTestOk ?? null,
      };
    }),
  );
}

export async function recordTestResult(
  workspaceId: string,
  provider: ProviderKey,
  ok: boolean,
) {
  await prisma.integration
    .update({
      where: { workspaceId_provider: { workspaceId, provider } },
      data: { lastTestAt: new Date(), lastTestOk: ok },
    })
    .catch(() => undefined);
}
