import twilio, { type Twilio } from 'twilio';
import { getCredentials } from '@/lib/credentials';
import { recordUsage } from '@/lib/usage';
import { normalizePhone } from '@/lib/utils';

/** Twilio voice + SMS + WhatsApp (spec §4.1, §4.4, §4.7). */

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
};

/**
 * Demo mode. Lets the SMS and voice modules be exercised end to end without a
 * paid Twilio number — for evaluating the script before committing to an
 * account, and for local development.
 *
 * Nothing leaves the machine: sends are logged and metered, never dispatched.
 * It is opt-in via the environment and never inferred, so a production install
 * cannot silently stop delivering real messages.
 */
export function telephonySimulated(): boolean {
  return process.env.ROSTER_SIMULATE_TELEPHONY === '1';
}

export class TwilioNotConfiguredError extends Error {
  constructor() {
    super('Twilio is not configured. Add your credentials in Settings → Integrations.');
  }
}

export async function getTwilioConfig(workspaceId: string): Promise<TwilioConfig> {
  const creds = await getCredentials(workspaceId, 'twilio');
  if (!creds.accountSid || !creds.authToken) throw new TwilioNotConfiguredError();
  return {
    accountSid: creds.accountSid,
    authToken: creds.authToken,
    phoneNumber: creds.phoneNumber ?? '',
  };
}

export async function getTwilioClient(workspaceId: string): Promise<Twilio> {
  const { accountSid, authToken } = await getTwilioConfig(workspaceId);
  return twilio(accountSid, authToken);
}

export async function isTwilioConfigured(workspaceId: string): Promise<boolean> {
  // Demo mode counts as configured, or every SMS-dependent feature would show
  // itself as unavailable and there would be nothing to demonstrate.
  if (telephonySimulated()) return true;
  const creds = await getCredentials(workspaceId, 'twilio');
  return Boolean(creds.accountSid && creds.authToken && creds.phoneNumber);
}

// ── SMS ──────────────────────────────────────────────────────────────────────

export async function sendSms(
  workspaceId: string,
  to: string,
  body: string,
): Promise<{ sid: string }> {
  const normalized = normalizePhone(to);
  if (!normalized) throw new Error(`"${to}" is not a usable phone number.`);

  // Validate the number first, then short-circuit — so demo mode still
  // surfaces a bad number exactly as the real path would.
  if (telephonySimulated()) return simulateSend(workspaceId, 'sms', normalized, body);

  const config = await getTwilioConfig(workspaceId);
  const client = twilio(config.accountSid, config.authToken);

  const message = await client.messages.create({
    to: normalized,
    from: config.phoneNumber,
    body: body.slice(0, 1600),
  });

  await recordUsage(workspaceId, 'sms_sent', 1);
  return { sid: message.sid };
}

export async function sendWhatsApp(workspaceId: string, to: string, body: string) {
  const normalized = normalizePhone(to);
  if (!normalized) throw new Error(`"${to}" is not a usable phone number.`);

  if (telephonySimulated()) return simulateSend(workspaceId, 'whatsapp', normalized, body);

  const config = await getTwilioConfig(workspaceId);
  const client = twilio(config.accountSid, config.authToken);

  const message = await client.messages.create({
    to: `whatsapp:${normalized}`,
    from: `whatsapp:${config.phoneNumber}`,
    body: body.slice(0, 1600),
  });

  await recordUsage(workspaceId, 'sms_sent', 1);
  return { sid: message.sid };
}

/**
 * Stands in for a real dispatch. Usage is still metered so the analytics and
 * quota surfaces show realistic numbers during a demo, and the SID is clearly
 * marked so a simulated send can never be mistaken for a delivered one.
 */
async function simulateSend(
  workspaceId: string,
  channel: 'sms' | 'whatsapp',
  to: string,
  body: string,
): Promise<{ sid: string }> {
  const sid = `SIMULATED${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
  console.info(
    `[telephony:simulated] ${channel} -> ${to}: ${body.slice(0, 90)}${body.length > 90 ? '…' : ''}`,
  );
  await recordUsage(workspaceId, 'sms_sent', 1);
  return { sid };
}

// ── Voice (TwiML) ────────────────────────────────────────────────────────────

const VOICE = { voice: 'Polly.Joanna' as const, language: 'en-US' as const };

/**
 * Greeting + gather. `speechTimeout: 'auto'` lets Twilio decide when the
 * caller stopped talking, which sounds far more natural than a fixed timeout.
 */
export function twimlGreeting(greeting: string, actionUrl: string): string {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    input: ['speech'],
    action: actionUrl,
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    actionOnEmptyResult: true,
  });
  gather.say(VOICE, greeting);
  return response.toString();
}

/** Speak the agent's reply, then listen again. */
export function twimlReply(text: string, actionUrl: string): string {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    input: ['speech'],
    action: actionUrl,
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    actionOnEmptyResult: true,
  });
  gather.say(VOICE, text);
  response.say(VOICE, 'Thanks for calling. Goodbye.');
  response.hangup();
  return response.toString();
}

export function twimlHangup(message?: string): string {
  const response = new twilio.twiml.VoiceResponse();
  if (message) response.say(VOICE, message);
  response.hangup();
  return response.toString();
}

export function twimlVoicemail(prompt: string, recordCallbackUrl: string): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say(VOICE, prompt);
  response.record({
    maxLength: 120,
    playBeep: true,
    transcribe: true,
    transcribeCallback: recordCallbackUrl,
  });
  response.hangup();
  return response.toString();
}

export function twimlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

/**
 * Validates the X-Twilio-Signature header so a third party can't forge
 * webhooks into a buyer's install.
 */
export async function validateTwilioSignature(
  workspaceId: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  // Demo mode has no Twilio account, so there is no shared secret to sign
  // with. Accepting unsigned callbacks is only safe because it demands an
  // explicit ROSTER_SIMULATE_TELEPHONY=1 that no real install would set —
  // and in that mode nothing is ever actually sent or charged.
  if (telephonySimulated()) return true;
  if (process.env.NODE_ENV === 'development' && !signature) return true;
  if (!signature) return false;

  try {
    const { authToken } = await getTwilioConfig(workspaceId);
    return twilio.validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}

export async function verifyTwilio(config: TwilioConfig): Promise<{ ok: boolean; message?: string }> {
  try {
    const client = twilio(config.accountSid, config.authToken);
    await client.api.v2010.accounts(config.accountSid).fetch();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
