import { prisma } from '@/lib/db';
import { created, fail, ok, parseBody, withPublic } from '@/lib/api';
import { installSchema } from '@/lib/validation';
import {
  checkDatabase,
  checkEnvironment,
  checkRedis,
  getInstallState,
  hasAnyUser,
  markInstalled,
} from '@/lib/install';
import { hashPassword } from '@/lib/auth';
import { provisionWorkspace } from '@/lib/workspace';
import { saveCredentials } from '@/lib/credentials';
import { verifyAndStoreLicense } from '@/lib/integrations/envato';

/**
 * Install wizard endpoint (spec §9). Public, but it self-disables the moment
 * an install exists — otherwise it would be a permanent admin-creation
 * backdoor on every deployed copy.
 */

export const GET = withPublic(async () => {
  const [state, db, redis] = await Promise.all([
    getInstallState(),
    checkDatabase(),
    checkRedis(),
  ]);

  return ok({
    state,
    checks: { environment: checkEnvironment(), database: db, redis },
    alreadyHasUsers: await hasAnyUser(),
  });
});

export const POST = withPublic(async (req) => {
  const state = await getInstallState();
  if (state.completed) {
    return fail(409, 'Roster is already installed. Sign in at /login.');
  }
  if (await hasAnyUser()) {
    return fail(409, 'An account already exists on this install. Sign in at /login.');
  }

  const db = await checkDatabase();
  if (!db.ok) {
    return fail(
      503,
      `Cannot reach the database: ${db.message}. Check DATABASE_URL, then run "npm run db:deploy".`,
    );
  }

  if (!process.env.ENCRYPTION_KEY) {
    return fail(
      400,
      'ENCRYPTION_KEY is not set. Generate one with "openssl rand -base64 32" and add it to .env before installing — it encrypts every stored API key.',
    );
  }
  if (!process.env.NEXTAUTH_SECRET) {
    return fail(
      400,
      'NEXTAUTH_SECRET is not set. Generate one with "openssl rand -base64 32" and add it to .env.',
    );
  }

  const body = await parseBody(req, installSchema);
  const email = body.adminEmail.toLowerCase().trim();

  const workspace = await provisionWorkspace({
    name: body.workspaceName,
    niche: body.niche ?? null,
    businessName: body.workspaceName,
    businessEmail: email,
  });

  await prisma.user.create({
    data: {
      email,
      name: body.adminName,
      passwordHash: await hashPassword(body.adminPassword),
      role: 'super_admin',
      workspaceId: workspace.id,
    },
  });

  if (body.anthropicKey) {
    await saveCredentials(workspace.id, 'anthropic', { apiKey: body.anthropicKey });
  }
  if (body.openaiKey) {
    await saveCredentials(workspace.id, 'openai', { apiKey: body.openaiKey });
  }

  let license = null;
  if (body.purchaseCode) {
    license = await verifyAndStoreLicense(workspace.id, body.purchaseCode);
  }

  await markInstalled();

  return created({
    workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
    license,
    redirectTo: '/login',
  });
});
