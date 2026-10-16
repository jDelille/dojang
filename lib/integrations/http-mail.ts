/**
 * Transactional email over a plain HTTP API.
 *
 * The fallback route when a workspace has not set up its own SMTP: configured
 * server-wide in .env, so a fresh install can send a password reset before the
 * buyer has found any credentials. A workspace that sets SMTP in Settings →
 * Integrations always wins — see sendEmail() in mailer.ts.
 *
 * Deliberately provider-agnostic. Any service that accepts a JSON POST with a
 * bearer token works — Resend, Mailgun, SendGrid, Postmark, Brevo, or a
 * self-hosted relay. Set MAIL_API_ENDPOINT to that provider's send URL and
 * MAIL_API_KEY to the key; there is no default endpoint, so nothing is sent
 * anywhere until the buyer chooses where.
 *
 * The request body uses the shape every one of those providers accepts:
 * `{ from, to[], subject, html, text }`. The response reader is tolerant of
 * where each provider puts the message id.
 */

export class MailApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MailApiError';
  }
}

export function mailApiConfigured(): boolean {
  return Boolean(process.env.MAIL_API_KEY && process.env.MAIL_API_ENDPOINT);
}

/**
 * Most providers issue sandbox keys that accept and log a message without ever
 * delivering it. Surfaced so the installer can say so, rather than leaving the
 * buyer to wonder why a test email never arrived.
 */
export function mailApiIsTestKey(): boolean {
  return /(^|_)test_/.test(process.env.MAIL_API_KEY ?? '');
}

export interface MailApiMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}

export async function sendViaMailApi(message: MailApiMessage): Promise<{ messageId: string }> {
  const apiKey = process.env.MAIL_API_KEY;
  const endpoint = process.env.MAIL_API_ENDPOINT;
  if (!apiKey) throw new MailApiError('MAIL_API_KEY is not set.');
  if (!endpoint) throw new MailApiError('MAIL_API_ENDPOINT is not set.');

  const from = message.from || process.env.EMAIL_FROM;
  if (!from) {
    throw new MailApiError('No sender address. Set EMAIL_FROM in your .env.');
  }

  // A hung mail call must not hold a request open indefinitely — retention
  // sends run in a worker where that would stall the whole queue.
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        ...(message.html ? { html: message.html } : {}),
        ...(message.text ? { text: message.text } : {}),
        ...(message.cc?.length ? { cc: message.cc } : {}),
        ...(message.bcc?.length ? { bcc: message.bcc } : {}),
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      }),
      signal: abort.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new MailApiError('The mail API did not respond within 20 seconds.');
    }
    throw new MailApiError(`Could not reach the mail API: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  // Providers disagree about where the id lives — top level, nested under
  // `data`, or called `id`. Read all three rather than pick one and break on
  // the next provider a buyer points this at.
  const payload = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string | { message?: string };
    message?: string;
    data?: { messageId?: string; id?: string; status?: string };
    messageId?: string;
    id?: string;
  };

  if (!res.ok || payload.success === false) {
    const detail =
      typeof payload.error === 'string'
        ? payload.error
        : (payload.error?.message ?? payload.message);
    throw new MailApiError(
      detail || `The mail API rejected the message (HTTP ${res.status}).`,
      res.status,
    );
  }

  return {
    messageId:
      payload.data?.messageId ?? payload.data?.id ?? payload.messageId ?? payload.id ?? '',
  };
}

/** Credential check for the installer and Settings → Integrations. */
export async function verifyMailApi(): Promise<{ ok: boolean; message?: string }> {
  if (!process.env.MAIL_API_KEY) return { ok: false, message: 'MAIL_API_KEY is not set.' };
  const endpoint = process.env.MAIL_API_ENDPOINT;
  if (!endpoint) return { ok: false, message: 'MAIL_API_ENDPOINT is not set.' };

  try {
    // Deliberately an empty payload: it proves the key is accepted without
    // actually delivering anything. A bad key answers 401 before validation.
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'The mail API rejected that key.' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
