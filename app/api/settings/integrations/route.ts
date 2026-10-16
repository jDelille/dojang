import { z } from 'zod';
import { fail, noContent, ok, parseBody, searchParams, withWorkspace } from '@/lib/api';
import { integrationSaveSchema } from '@/lib/validation';
import {
  deleteCredentials,
  getCredentials,
  listIntegrationStatus,
  recordTestResult,
  saveCredentials,
  type ProviderKey,
} from '@/lib/credentials';
import { ClaudeAdapter } from '@/lib/ai/providers/claude';
import { OpenAiAdapter } from '@/lib/ai/providers/openai';
import { verifyTwilio } from '@/lib/integrations/twilio';
import { verifyStripe } from '@/lib/integrations/stripe';
import { verifyPaystack } from '@/lib/integrations/paystack';
import { verifySmtp } from '@/lib/integrations/mailer';
import { verifyFcm } from '@/lib/integrations/fcm';
import { verifyMapsKey } from '@/lib/integrations/googleMaps';

/**
 * Integration credentials. Secrets are returned masked, never in the clear —
 * writes go through the AES-GCM vault in lib/crypto.ts.
 */

export const GET = withWorkspace(async (ctx) => {
  const integrations = await listIntegrationStatus(ctx.workspaceId);
  return ok({ integrations });
}, 'integrations:manage');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, integrationSaveSchema);

  // A masked echo means "unchanged" — never write the mask back as the secret.
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.credentials)) {
    if (value.includes('…')) continue;
    cleaned[key] = value;
  }

  await saveCredentials(ctx.workspaceId, body.provider, cleaned, body.config);
  const integrations = await listIntegrationStatus(ctx.workspaceId);

  return ok({ integrations });
}, 'integrations:manage');

/** PUT ?provider=… — live credential test. */
export const PUT = withWorkspace(async (ctx, req) => {
  const provider = searchParams(req).get('provider');
  const parsed = z
    .enum(['anthropic', 'openai', 'twilio', 'stripe', 'paystack', 'smtp', 'google_maps', 'fcm'])
    .safeParse(provider);
  if (!parsed.success) return fail(400, 'Provide a valid ?provider=.');

  const creds = await getCredentials(ctx.workspaceId, parsed.data);
  let result: { ok: boolean; message?: string };

  try {
    switch (parsed.data) {
      case 'anthropic':
        result = await new ClaudeAdapter(creds.apiKey).verify();
        break;
      case 'openai':
        result = await new OpenAiAdapter(creds.apiKey).verify();
        break;
      case 'twilio':
        result = await verifyTwilio({
          accountSid: creds.accountSid,
          authToken: creds.authToken,
          phoneNumber: creds.phoneNumber,
        });
        break;
      case 'stripe':
        result = await verifyStripe(creds.secretKey);
        break;
      case 'paystack':
        result = await verifyPaystack(creds.secretKey);
        break;
      case 'smtp':
        result = await verifySmtp({
          host: creds.host,
          port: Number(creds.port || 587),
          secure: String(creds.secure) === 'true',
          user: creds.user,
          password: creds.password,
          from: creds.from,
        });
        break;
      case 'google_maps':
        result = await verifyMapsKey(creds.apiKey);
        break;
      case 'fcm':
        // Actually exchanges the key for a token rather than just checking a
        // field is non-empty — a malformed service account should fail here,
        // not silently at the first notification.
        result = await verifyFcm(creds.serviceAccount ?? '');
        break;
    }
  } catch (error) {
    result = { ok: false, message: (error as Error).message };
  }

  await recordTestResult(ctx.workspaceId, parsed.data as ProviderKey, result.ok);
  return ok(result);
}, 'integrations:manage');

export const DELETE = withWorkspace(async (ctx, req) => {
  const provider = searchParams(req).get('provider');
  const parsed = z
    .enum(['anthropic', 'openai', 'twilio', 'stripe', 'paystack', 'smtp', 'google_maps', 'fcm'])
    .safeParse(provider);
  if (!parsed.success) return fail(400, 'Provide a valid ?provider=.');

  await deleteCredentials(ctx.workspaceId, parsed.data);
  return noContent();
}, 'integrations:manage');
