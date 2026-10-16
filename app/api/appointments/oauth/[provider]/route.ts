import { NextResponse } from 'next/server';
import { fail, routeParam, withWorkspace } from '@/lib/api';
import { getAuthUrl, isCalendarConfigured } from '@/lib/integrations/calendar';
import { encrypt } from '@/lib/crypto';
import type { CalendarProvider } from '@prisma/client';

/** Kicks off the Google/Outlook OAuth dance for calendar sync. */
export const GET = withWorkspace(async (ctx, _req, params) => {
  const raw = await routeParam(params, 'provider');
  if (raw !== 'google' && raw !== 'outlook') {
    return fail(400, 'Provider must be "google" or "outlook".');
  }
  const provider = raw as CalendarProvider;

  if (!isCalendarConfigured(provider)) {
    return fail(
      400,
      provider === 'google'
        ? 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before connecting Google Calendar.'
        : 'Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET before connecting Outlook.',
    );
  }

  // The state carries the workspace id, encrypted so a third party can't
  // redirect a token grant into someone else's workspace.
  const state = encrypt(JSON.stringify({ workspaceId: ctx.workspaceId, at: Date.now() }));

  return NextResponse.redirect(getAuthUrl(provider, state));
}, 'integrations:manage');
