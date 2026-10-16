import { prisma } from '@/lib/db';
import { withPublic } from '@/lib/api';
import {
  twimlGreeting,
  twimlHangup,
  twimlResponse,
  validateTwilioSignature,
} from '@/lib/integrations/twilio';
import { absoluteUrl, readTwilioForm, requestUrl, resolveWorkspaceByNumber } from '@/lib/voice';
import { loadAgentContext } from '@/lib/ai';
import { upsertContact, logActivity } from '@/lib/workspace';
import { normalizePhone } from '@/lib/utils';

/**
 * Twilio webhook for inbound calls (spec §6).
 *
 * Flow: greet the caller → gather their speech → /api/voice/respond feeds it to
 * the AI agent and speaks the answer back. The call row is created here so a
 * hang-up mid-conversation still leaves a record.
 */
export const POST = withPublic(async (req) => {
  const form = await readTwilioForm(req);
  const from = form.From ?? '';
  const to = form.To ?? '';
  const callSid = form.CallSid ?? '';

  const workspaceId = await resolveWorkspaceByNumber(to);
  if (!workspaceId) {
    return twimlResponse(
      twimlHangup('This number is not configured yet. Please try again later.'),
    );
  }

  const signatureValid = await validateTwilioSignature(
    workspaceId,
    req.headers.get('x-twilio-signature'),
    requestUrl(req),
    form,
  );
  if (!signatureValid) {
    return new Response('Invalid Twilio signature', { status: 403 });
  }

  const phone = normalizePhone(from);
  const contact = phone
    ? await upsertContact(workspaceId, { phone, name: form.CallerName || phone })
    : null;

  await prisma.call.upsert({
    where: { providerCallSid: callSid },
    create: {
      workspaceId,
      contactId: contact?.id ?? null,
      direction: 'in',
      fromNumber: from,
      toNumber: to,
      providerCallSid: callSid,
      status: 'in-progress',
    },
    update: { status: 'in-progress' },
  });

  await logActivity({
    workspaceId,
    contactId: contact?.id,
    type: 'call',
    title: `Inbound call from ${from}`,
  });

  const ctx = await loadAgentContext(workspaceId);
  const greeting =
    ctx?.agent.greeting?.trim() ||
    `Thanks for calling ${ctx?.workspace.businessName || 'us'}. How can I help you today?`;

  return twimlResponse(twimlGreeting(greeting, absoluteUrl('/api/voice/respond')));
});
