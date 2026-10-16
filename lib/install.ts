import { prisma } from '@/lib/db';

/**
 * Installer state (spec §9). CodeCanyon reviewers weight the install
 * experience heavily, so first boot routes to /install until this flag is set.
 */

const INSTALL_KEY = 'install.completed';

export type InstallState = {
  completed: boolean;
  completedAt: string | null;
  version: string;
};

export async function getInstallState(): Promise<InstallState> {
  try {
    const record = await prisma.systemSetting.findUnique({ where: { key: INSTALL_KEY } });
    if (!record) return { completed: false, completedAt: null, version: '1.0.0' };

    const value = record.value as Partial<InstallState>;
    return {
      completed: Boolean(value.completed),
      completedAt: value.completedAt ?? record.updatedAt.toISOString(),
      version: value.version ?? '1.0.0',
    };
  } catch {
    // No database yet — that is exactly the state the installer exists to fix.
    return { completed: false, completedAt: null, version: '1.0.0' };
  }
}

export async function markInstalled() {
  const value: InstallState = {
    completed: true,
    completedAt: new Date().toISOString(),
    version: '1.0.0',
  };

  await prisma.systemSetting.upsert({
    where: { key: INSTALL_KEY },
    create: { key: INSTALL_KEY, value: value as never },
    update: { value: value as never },
  });
}

export type EnvCheck = {
  key: string;
  label: string;
  present: boolean;
  required: boolean;
  hint: string;
};

/** Pre-flight checks shown on step 1 of the installer. */
export function checkEnvironment(): EnvCheck[] {
  const has = (key: string) => Boolean(process.env[key]);

  return [
    {
      key: 'DATABASE_URL',
      label: 'PostgreSQL connection',
      present: has('DATABASE_URL'),
      required: true,
      hint: 'postgresql://user:password@host:5432/roster',
    },
    {
      key: 'REDIS_URL',
      label: 'Redis connection',
      present: has('REDIS_URL'),
      required: true,
      hint: 'Needed for background jobs (lead gen, retention sends, reminders).',
    },
    {
      key: 'NEXTAUTH_SECRET',
      label: 'Auth secret',
      present: has('NEXTAUTH_SECRET'),
      required: true,
      hint: 'Generate with: openssl rand -base64 32',
    },
    {
      key: 'ENCRYPTION_KEY',
      label: 'Credential encryption key',
      present: has('ENCRYPTION_KEY'),
      required: true,
      hint: 'Generate with: openssl rand -base64 32 — encrypts stored API keys at rest.',
    },
    {
      key: 'NEXT_PUBLIC_APP_URL',
      label: 'Public URL',
      present: has('NEXT_PUBLIC_APP_URL'),
      required: true,
      hint: 'Used for webhooks, pay links and the chat widget snippet.',
    },
    {
      key: 'ANTHROPIC_API_KEY',
      label: 'Anthropic API key',
      present: has('ANTHROPIC_API_KEY'),
      required: false,
      hint: 'Optional here — can be set per workspace in Settings → Integrations.',
    },
    {
      key: 'OPENAI_API_KEY',
      label: 'OpenAI API key',
      present: has('OPENAI_API_KEY'),
      required: false,
      hint: 'Optional. Configure either provider (or both).',
    },
    {
      key: 'ENVATO_PERSONAL_TOKEN',
      label: 'Envato personal token',
      present: has('ENVATO_PERSONAL_TOKEN'),
      required: false,
      hint: 'Required only to verify purchase codes online.',
    },
  ];
}

export async function checkDatabase(): Promise<{ ok: boolean; message: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, message: 'Connected.' };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function checkRedis(): Promise<{ ok: boolean; message: string }> {
  const url = process.env.REDIS_URL;
  if (!url) return { ok: false, message: 'REDIS_URL is not set.' };

  try {
    const { default: IORedis } = await import('ioredis');
    const client = new IORedis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      lazyConnect: true,
    });
    await client.connect();
    await client.ping();
    await client.quit();
    return { ok: true, message: 'Connected.' };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function hasAnyUser(): Promise<boolean> {
  try {
    return (await prisma.user.count()) > 0;
  } catch {
    return false;
  }
}
