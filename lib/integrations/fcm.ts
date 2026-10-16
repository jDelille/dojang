import { createSign } from 'node:crypto';
import { getCredentials } from '@/lib/credentials';

/**
 * Firebase Cloud Messaging over the HTTP v1 API.
 *
 * The legacy `fcm.googleapis.com/fcm/send` endpoint and its `Authorization:
 * key=<server key>` scheme were decommissioned in June 2024 — the previous
 * implementation targeted both, so mobile push could never have worked.
 *
 * v1 authenticates with a short-lived OAuth2 access token minted from a
 * service-account key. The JWT is signed here with Node's own crypto rather
 * than pulling in `google-auth-library`, which would add a large dependency to
 * a self-hosted script for one signature.
 */

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** Access tokens last an hour; re-minting one per notification is wasteful. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function parseServiceAccount(raw: string): ServiceAccount | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      // Keys pasted into a form or an .env arrive with literal \n sequences.
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const cached = tokenCache.get(account.client_email);
  // 60s of headroom so a token cannot expire mid-flight.
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(account.private_key));
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };

  if (!res.ok || !body.access_token) {
    throw new Error(
      `Google rejected the service account: ${body.error_description ?? body.error ?? res.status}`,
    );
  }

  tokenCache.set(account.client_email, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });
  return body.access_token;
}

export interface FcmResult {
  sent: number;
  /** Tokens the device no longer holds — the caller should delete these. */
  invalid: string[];
}

/**
 * Sends one notification to many device tokens.
 *
 * v1 has no `registration_ids` batch, so this fans out one request per token.
 * Failures are per-token: a single dead device must not stop the rest.
 */
export async function sendFcmV1(
  workspaceId: string,
  payload: { title: string; body: string; url?: string },
  tokens: string[],
): Promise<FcmResult> {
  if (!tokens.length) return { sent: 0, invalid: [] };

  const { serviceAccount } = await getCredentials(workspaceId, 'fcm');
  const account = parseServiceAccount(serviceAccount ?? '');
  if (!account) return { sent: 0, invalid: [] };

  let accessToken: string;
  try {
    accessToken = await getAccessToken(account);
  } catch (error) {
    console.error('[fcm]', (error as Error).message);
    return { sent: 0, invalid: [] };
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;
  const invalid: string[] = [];
  let sent = 0;

  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: payload.title, body: payload.body },
            // Data values must be strings in v1 — numbers are rejected.
            data: { url: payload.url ?? '/' },
            webpush: { fcmOptions: { link: payload.url ?? '/' } },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) return { token, ok: true as const };

      const detail = (await res.json().catch(() => ({}))) as {
        error?: { status?: string; message?: string };
      };
      const status = detail.error?.status ?? String(res.status);
      // UNREGISTERED / INVALID_ARGUMENT mean the token is dead, not that the
      // send failed transiently — those are safe to prune.
      const dead = status === 'UNREGISTERED' || status === 'NOT_FOUND' || res.status === 404;
      return { token, ok: false as const, dead, status };
    }),
  );

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    if (result.value.ok) sent += 1;
    else if (result.value.dead) invalid.push(result.value.token);
  }

  return { sent, invalid };
}

/** Credential check for Settings → Integrations. */
export async function verifyFcm(serviceAccountJson: string): Promise<{ ok: boolean; message?: string }> {
  const account = parseServiceAccount(serviceAccountJson);
  if (!account) {
    return {
      ok: false,
      message:
        'That does not look like a Firebase service-account key. Download the JSON from Firebase Console → Project settings → Service accounts.',
    };
  }
  try {
    await getAccessToken(account);
    return { ok: true, message: `Authenticated as ${account.client_email}` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
