import { prisma } from '@/lib/db';
import { noContent, withPublic } from '@/lib/api';
import { sendSms, validateTwilioSignature } from '@/lib/integrations/twilio';
import { readTwilioForm, requestUrl, resolveWorkspaceByNumber } from '@/lib/voice';
import { recordUsage } from '@/lib/usage';
import { logActivity } from '@/lib/workspace';
import { runUtilityPrompt } from '@/lib/ai';
import { UTILITY_PROMPTS } from '@/lib/ai/prompt';
import { sendPush } from '@/lib/integrations/push';

/**
 * Twilio call status callback (spec §6).
 *
 * Two jobs:
 *  1. Missed-call text-back (spec §4.4) — any unanswered inbound call
 *     immediately triggers an SMS to the caller.
 *  2. Summarize the transcript into the CRM timeline.
 */
export const POST = withPublic(async (req) => {
  const form = await readTwilioForm(req);
  const callSid = form.CallSid ?? '';
  const status = form.CallStatus ?? '';
  const duration = Number(form.CallDuration ?? 0);
  const to = form.To ?? '';

  const workspaceId = await resolveWorkspaceByNumber(to);
  if (!workspaceId) return noContent();

  const signatureValid = await validateTwilioSignature(
    workspaceId,
    req.headers.get('x-twilio-signature'),
    requestUrl(req),
    form,
  );
  if (!signatureValid) return new Response('Invalid Twilio signature', { status: 403 });

  const call = await prisma.call.findUnique({ where: { providerCallSid: callSid } });
  if (!call) return noContent();

  const missed =
    call.direction === 'in' &&
    ['no-answer', 'busy', 'failed', 'canceled'].includes(status) &&
    duration < 5;

  await prisma.call.update({
    where: { id: call.id },
    data: {
      status,
      durationSeconds: duration,
      recordingUrl: form.RecordingUrl ?? call.recordingUrl,
      missed,
    },
  });

  if (duration > 0) {
    await recordUsage(workspaceId, 'calls_minutes', Math.ceil(duration / 60));
  }

  // ── Missed-call text-back ──────────────────────────────────────────────────
  if (missed && !call.textBackSent) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { businessName: true, name: true },
    });
    const businessName = workspace?.businessName || workspace?.name || 'us';

    try {
      await sendSms(
        workspaceId,
        call.fromNumber,
        `Sorry we missed your call — this is ${businessName}. Reply here and we'll help you right away.`,
      );
      await prisma.call.update({ where: { id: call.id }, data: { textBackSent: true } });

      await logActivity({
        workspaceId,
        contactId: call.contactId,
        type: 'message',
        title: 'Missed-call text-back sent',
        body: `Auto-SMS to ${call.fromNumber}`,
      });
    } catch (error) {
      // Twilio not configured, or the number can't receive SMS — log and move on.
      console.error('[voice] text-back failed', (error as Error).message);
    }

    await sendPush(workspaceId, {
      title: 'Missed call',
      body: `${call.fromNumber} called and got no answer. We texted them back.`,
      url: '/dashboard/inbox',
    });
  }

  // ── Transcript summary ────────────────────────────────────────────────────
  if (call.transcript && !call.summary && status === 'completed') {
    try {
      const summary = await runUtilityPrompt(
        workspaceId,
        UTILITY_PROMPTS.callSummary,
        call.transcript,
        { maxTokens: 300 },
      );
      await prisma.call.update({ where: { id: call.id }, data: { summary } });

      await logActivity({
        workspaceId,
        contactId: call.contactId,
        type: 'call',
        title: `Call summary (${Math.round(duration / 60)}m)`,
        body: summary,
      });
    } catch (error) {
      console.error('[voice] summary failed', (error as Error).message);
    }
  }

  return noContent();
});
