import { z } from 'zod';
import { cookies } from 'next/headers';
import { ok, parseBody, withAuth } from '@/lib/api';
import { LOCALES, LOCALE_COOKIE } from '@/lib/i18n/config';

/** Persists the viewer's language. Per user, not per workspace — colleagues
 *  in the same business may not read the same language. */
export const POST = withAuth(async (_ctx, req) => {
  const body = await parseBody(req, z.object({ locale: z.enum(LOCALES) }));

  const store = await cookies();
  store.set(LOCALE_COOKIE, body.locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: false,
  });

  return ok({ locale: body.locale });
});
