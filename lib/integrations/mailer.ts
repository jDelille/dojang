import nodemailer, { type Transporter } from 'nodemailer';
import { getCredentials } from '@/lib/credentials';
import { recordUsage } from '@/lib/usage';
import { mailApiConfigured, sendViaMailApi } from '@/lib/integrations/http-mail';

/**
 * Email delivery (spec §2), with two routes:
 *
 *  1. Per-workspace SMTP — Postmark, SES, Mailgun, Gmail, anything that
 *     speaks SMTP. Set in Settings → Integrations, and always preferred, so
 *     a white-labeled workspace keeps sending from its own infrastructure.
 *  2. An HTTP mail API — a server-wide default from .env, used when a
 *     workspace has not configured its own SMTP.
 *
 * Without (2) a fresh install could not send anything at all until the buyer
 * went and found SMTP credentials.
 */

export class SmtpNotConfiguredError extends Error {
  constructor() {
    super('Email is not configured. Add SMTP credentials in Settings → Integrations.');
  }
}

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export async function getSmtpConfig(workspaceId: string): Promise<SmtpConfig> {
  const creds = await getCredentials(workspaceId, 'smtp');
  if (!creds.host) throw new SmtpNotConfiguredError();

  return {
    host: creds.host,
    port: Number(creds.port || 587),
    secure: String(creds.secure) === 'true',
    user: creds.user ?? '',
    password: creds.password ?? '',
    from: creds.from || `Roster <no-reply@${creds.host.replace(/^smtp\./, '')}>`,
  };
}

export function createTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });
}

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export async function sendEmail(
  workspaceId: string,
  options: SendEmailOptions,
): Promise<{ messageId: string }> {
  const smtp = await getSmtpConfig(workspaceId).catch((error) => {
    // Only fall through to the mail API for "not configured" — a genuinely
    // broken SMTP setup should surface, not be silently rerouted.
    if (error instanceof SmtpNotConfiguredError && mailApiConfigured()) return null;
    throw error;
  });

  if (!smtp) {
    const sent = await sendViaMailApi({
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text ?? stripHtml(options.html),
      replyTo: options.replyTo,
    });
    await recordUsage(workspaceId, 'emails_sent', 1);
    return sent;
  }

  const config = smtp;
  const transport = createTransport(config);

  const info = await transport.sendMail({
    from: config.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text ?? stripHtml(options.html),
    replyTo: options.replyTo,
  });

  await recordUsage(workspaceId, 'emails_sent', 1);
  return { messageId: info.messageId };
}

export async function verifySmtp(config: SmtpConfig): Promise<{ ok: boolean; message?: string }> {
  try {
    await createTransport(config).verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Templates ────────────────────────────────────────────────────────────────

type BrandOptions = {
  businessName: string;
  accentColor?: string | null;
  logoUrl?: string | null;
};

/**
 * Shared email shell. Inline styles only — email clients strip <style> blocks
 * and none of them support CSS custom properties.
 */
export function renderEmail(
  brand: BrandOptions,
  body: string,
  cta?: { label: string; url: string },
): string {
  const accent = brand.accentColor || '#E8A33D';

  const ctaBlock = cta
    ? `<tr><td style="padding:8px 32px 32px;">
         <a href="${escapeAttr(cta.url)}" style="display:inline-block;background:${escapeAttr(accent)};color:#1C1403;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;">${escapeHtml(cta.label)}</a>
       </td></tr>`
    : '';

  const logoBlock = brand.logoUrl
    ? `<img src="${escapeAttr(brand.logoUrl)}" alt="${escapeAttr(brand.businessName)}" height="32" style="display:block;height:32px;">`
    : `<span style="font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#0F1115;letter-spacing:-0.01em;">${escapeHtml(brand.businessName)}</span>`;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAFAF7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E7E9EC;border-radius:8px;">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #E7E9EC;">${logoBlock}</td></tr>
        <tr><td style="padding:32px 32px 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:#0F1115;">
          ${body}
        </td></tr>
        ${ctaBlock}
      </table>
      <p style="max-width:560px;margin:16px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#5B6472;text-align:center;">
        Sent by ${escapeHtml(brand.businessName)}
      </p>
    </td></tr>
  </table>
</body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

/** Turns a plain-text body (what the AI writes) into email-safe paragraphs. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 16px;">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
