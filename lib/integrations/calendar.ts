import { google } from 'googleapis';
import { prisma } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/crypto';
import type { CalendarAccount, CalendarProvider } from '@prisma/client';

/**
 * Calendar sync for appointment booking (spec §4.5).
 * Google Calendar via googleapis; Outlook via the Microsoft Graph REST API.
 *
 * OAuth tokens are stored as AES-GCM envelopes, same vault as every other
 * third-party credential.
 */

export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
};

export type FreeBusySlot = { start: Date; end: Date };

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

const MICROSOFT_SCOPES = [
  'offline_access',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/User.Read',
];

/**
 * The install's own public URL.
 *
 * Exported because anything redirecting a browser back into the app must use
 * this and never the request's origin: behind nginx or any reverse proxy the
 * request arrives at 127.0.0.1:<port>, so a redirect built from it sends the
 * user to localhost.
 */
export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

export function calendarRedirectUri(provider: CalendarProvider): string {
  return `${appUrl()}/api/appointments/oauth/${provider}/callback`;
}

// ── Authorization URLs ───────────────────────────────────────────────────────

export function getAuthUrl(provider: CalendarProvider, state: string): string {
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not configured.');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: calendarRedirectUri('google'),
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent', // forces a refresh_token on repeat connections
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) throw new Error('MICROSOFT_CLIENT_ID is not configured.');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: calendarRedirectUri('outlook'),
    response_type: 'code',
    scope: MICROSOFT_SCOPES.join(' '),
    response_mode: 'query',
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

// ── Token exchange ───────────────────────────────────────────────────────────

type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  email: string;
};

export async function exchangeCode(
  provider: CalendarProvider,
  code: string,
): Promise<TokenSet> {
  if (provider === 'google') {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      calendarRedirectUri('google'),
    );
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const profile = await oauth2.userinfo.get();

    return {
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      email: profile.data.email ?? 'unknown',
    };
  }

  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
    client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
    code,
    grant_type: 'authorization_code',
    redirect_uri: calendarRedirectUri('outlook'),
  });

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || 'Microsoft token exchange failed.');
  }

  const me = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  }).then((r) => r.json() as Promise<{ mail?: string; userPrincipalName?: string }>);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    email: me.mail || me.userPrincipalName || 'unknown',
  };
}

export async function saveCalendarAccount(
  workspaceId: string,
  provider: CalendarProvider,
  tokens: TokenSet,
) {
  return prisma.calendarAccount.upsert({
    where: {
      workspaceId_provider_accountEmail: {
        workspaceId,
        provider,
        accountEmail: tokens.email,
      },
    },
    create: {
      workspaceId,
      provider,
      accountEmail: tokens.email,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt,
    },
    update: {
      accessToken: encrypt(tokens.accessToken),
      ...(tokens.refreshToken ? { refreshToken: encrypt(tokens.refreshToken) } : {}),
      expiresAt: tokens.expiresAt,
      isActive: true,
    },
  });
}

// ── Access-token refresh ─────────────────────────────────────────────────────

async function freshAccessToken(account: CalendarAccount): Promise<string> {
  const stillValid = account.expiresAt && account.expiresAt.getTime() - Date.now() > 60_000;
  if (stillValid) return decrypt(account.accessToken);
  if (!account.refreshToken) return decrypt(account.accessToken);

  const refreshToken = decrypt(account.refreshToken);

  if (account.provider === 'google') {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      calendarRedirectUri('google'),
    );
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();

    await prisma.calendarAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encrypt(credentials.access_token ?? ''),
        expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      },
    });
    return credentials.access_token ?? '';
  }

  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
    client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const data = (await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).then((r) => r.json())) as { access_token?: string; refresh_token?: string; expires_in?: number };

  if (data.access_token) {
    await prisma.calendarAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encrypt(data.access_token),
        ...(data.refresh_token ? { refreshToken: encrypt(data.refresh_token) } : {}),
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
      },
    });
  }

  return data.access_token ?? decrypt(account.accessToken);
}

// ── Event operations ─────────────────────────────────────────────────────────

export async function createCalendarEvent(
  account: CalendarAccount,
  event: {
    title: string;
    description?: string;
    location?: string;
    startsAt: Date;
    endsAt: Date;
    attendeeEmail?: string | null;
  },
): Promise<string | null> {
  const accessToken = await freshAccessToken(account);

  try {
    if (account.provider === 'google') {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth });

      const created = await calendar.events.insert({
        calendarId: account.calendarId || 'primary',
        requestBody: {
          summary: event.title,
          description: event.description,
          location: event.location,
          start: { dateTime: event.startsAt.toISOString() },
          end: { dateTime: event.endsAt.toISOString() },
          attendees: event.attendeeEmail ? [{ email: event.attendeeEmail }] : undefined,
        },
      });
      return created.data.id ?? null;
    }

    const response = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: event.title,
        body: { contentType: 'text', content: event.description ?? '' },
        location: { displayName: event.location ?? '' },
        start: { dateTime: event.startsAt.toISOString(), timeZone: 'UTC' },
        end: { dateTime: event.endsAt.toISOString(), timeZone: 'UTC' },
        attendees: event.attendeeEmail
          ? [{ emailAddress: { address: event.attendeeEmail }, type: 'required' }]
          : [],
      }),
    });

    const data = (await response.json()) as { id?: string };
    return data.id ?? null;
  } catch (error) {
    // A calendar outage must not lose the booking — the appointment row is
    // already written, so we log and carry on unsynced.
    console.error('[calendar] event creation failed', (error as Error).message);
    return null;
  }
}

export async function deleteCalendarEvent(account: CalendarAccount, eventId: string) {
  const accessToken = await freshAccessToken(account);

  try {
    if (account.provider === 'google') {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      await google
        .calendar({ version: 'v3', auth })
        .events.delete({ calendarId: account.calendarId || 'primary', eventId });
      return;
    }

    await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    console.error('[calendar] event deletion failed', (error as Error).message);
  }
}

export async function listBusySlots(
  account: CalendarAccount,
  from: Date,
  to: Date,
): Promise<FreeBusySlot[]> {
  const accessToken = await freshAccessToken(account);

  try {
    if (account.provider === 'google') {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const result = await google.calendar({ version: 'v3', auth }).freebusy.query({
        requestBody: {
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          items: [{ id: account.calendarId || 'primary' }],
        },
      });

      const calendars = result.data.calendars ?? {};
      const busy = Object.values(calendars).flatMap((c) => c.busy ?? []);
      return busy
        .filter((b) => b.start && b.end)
        .map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));
    }

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$select=start,end&$top=200`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = (await response.json()) as {
      value?: { start: { dateTime: string }; end: { dateTime: string } }[];
    };

    return (data.value ?? []).map((e) => ({
      start: new Date(`${e.start.dateTime}Z`),
      end: new Date(`${e.end.dateTime}Z`),
    }));
  } catch (error) {
    console.error('[calendar] freebusy lookup failed', (error as Error).message);
    return [];
  }
}

/**
 * Open slots the AI agent may book into during a chat or call (spec §4.5).
 * Combines calendar busy blocks with appointments already in Roster.
 */
export async function findOpenSlots(
  workspaceId: string,
  options: {
    from?: Date;
    days?: number;
    durationMinutes?: number;
    workdayStartHour?: number;
    workdayEndHour?: number;
    limit?: number;
  } = {},
): Promise<FreeBusySlot[]> {
  const from = options.from ?? new Date();
  const days = options.days ?? 7;
  const duration = (options.durationMinutes ?? 30) * 60_000;
  const startHour = options.workdayStartHour ?? 9;
  const endHour = options.workdayEndHour ?? 17;
  const limit = options.limit ?? 12;

  const to = new Date(from.getTime() + days * 86_400_000);

  const [account, appointments] = await Promise.all([
    prisma.calendarAccount.findFirst({ where: { workspaceId, isActive: true } }),
    prisma.appointment.findMany({
      where: {
        workspaceId,
        startsAt: { gte: from, lte: to },
        status: { in: ['scheduled', 'confirmed'] },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const busy: FreeBusySlot[] = appointments.map((a) => ({ start: a.startsAt, end: a.endsAt }));
  if (account) busy.push(...(await listBusySlots(account, from, to)));

  const slots: FreeBusySlot[] = [];
  const cursor = new Date(from);
  cursor.setMinutes(cursor.getMinutes() > 30 ? 60 : 30, 0, 0);

  while (cursor < to && slots.length < limit) {
    const hour = cursor.getHours();
    const day = cursor.getDay();

    const withinWorkday = hour >= startHour && hour < endHour && day !== 0 && day !== 6;
    if (withinWorkday) {
      const slotEnd = new Date(cursor.getTime() + duration);
      const overlaps = busy.some((b) => cursor < b.end && slotEnd > b.start);
      if (!overlaps) slots.push({ start: new Date(cursor), end: slotEnd });
    }

    cursor.setMinutes(cursor.getMinutes() + 30);
  }

  return slots;
}

export function isCalendarConfigured(provider: CalendarProvider): boolean {
  return provider === 'google'
    ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}
