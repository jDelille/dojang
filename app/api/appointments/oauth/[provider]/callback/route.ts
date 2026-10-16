import { NextResponse } from 'next/server';
import { routeParam, withPublic } from '@/lib/api';
import { appUrl, exchangeCode, saveCalendarAccount } from '@/lib/integrations/calendar';
import { decrypt } from '@/lib/crypto';
import type { CalendarProvider } from '@prisma/client';

/**
 * OAuth callback. Public by necessity (the provider redirects the browser
 * here), so trust comes from the encrypted `state` we issued, not the session.
 */
/**
 * Turns a provider error into one actionable sentence. Deliberately a
 * whitelist: raw provider output can carry trace and correlation ids, so only
 * recognized, safe causes are echoed and anything else stays generic.
 */
function summarizeOauthError(message: string): string {
  if (/AADSTS7000215|invalid client secret/i.test(message)) {
    return 'Microsoft rejected the client secret. Paste the secret Value, not the Secret ID — Azure only shows the Value once, just after you create it.';
  }
  if (/AADSTS700016|AADSTS(7|9)000\d+.*application.*not found|unauthorized_client/i.test(message)) {
    return 'The provider does not recognize this client id. Check MICROSOFT_CLIENT_ID / GOOGLE_CLIENT_ID.';
  }
  if (/AADSTS53003|conditional access/i.test(message)) {
    return 'Your Microsoft tenant blocked this with a Conditional Access policy. An administrator has to allow the app, or add an exclusion for it.';
  }
  if (/redirect_uri_mismatch|AADSTS50011/i.test(message)) {
    return 'The redirect URI does not match the one registered with the provider. It must match exactly, including port and scheme.';
  }
  if (/invalid_client/i.test(message)) {
    return 'The provider rejected the client id or secret. Check both values in your .env.';
  }
  if (/invalid_grant/i.test(message)) {
    return 'The authorization code was already used or expired. Start the connection again.';
  }
  if (/access_denied|consent/i.test(message)) {
    return 'Consent was not granted. If the app is still in Testing, add your account under Test users.';
  }
  return 'The provider rejected the connection. Check the server log for the exact error.';
}

export const GET = withPublic(async (req, params) => {
  const raw = await routeParam(params, 'provider');
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Built from the configured app URL, not url.origin. Behind a reverse proxy
  // the request origin is the internal 127.0.0.1:<port>, so redirecting to it
  // lands the buyer on localhost — the provider round trip succeeds and the
  // browser then goes nowhere useful.
  const settingsUrl = new URL('/dashboard/appointments', appUrl());

  if (error) {
    settingsUrl.searchParams.set('calendar', 'denied');
    return NextResponse.redirect(settingsUrl);
  }
  if (!code || !state || (raw !== 'google' && raw !== 'outlook')) {
    settingsUrl.searchParams.set('calendar', 'invalid');
    return NextResponse.redirect(settingsUrl);
  }

  let workspaceId: string;
  try {
    const parsed = JSON.parse(decrypt(state)) as { workspaceId: string; at: number };
    // 15-minute window keeps a leaked state value from being replayed later.
    if (!parsed.workspaceId || Date.now() - parsed.at > 15 * 60_000) throw new Error('stale');
    workspaceId = parsed.workspaceId;
  } catch {
    settingsUrl.searchParams.set('calendar', 'invalid');
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokens = await exchangeCode(raw as CalendarProvider, code);
    await saveCalendarAccount(workspaceId, raw as CalendarProvider, tokens);
    settingsUrl.searchParams.set('calendar', 'connected');
  } catch (err) {
    const message = (err as Error).message;
    console.error('[calendar] oauth callback failed', message);
    settingsUrl.searchParams.set('calendar', 'failed');
    // Providers explain these failures precisely — Microsoft's AADSTS codes
    // and Google's invalid_client name the exact misconfiguration. Swallowing
    // that leaves the operator with "could not connect" and the real answer
    // buried in a server log they will never read.
    settingsUrl.searchParams.set('reason', summarizeOauthError(message));
  }

  return NextResponse.redirect(settingsUrl);
});
