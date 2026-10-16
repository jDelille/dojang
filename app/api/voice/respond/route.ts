import { prisma } from '@/lib/db';
import { withPublic } from '@/lib/api';
import {
  twimlHangup,
  twimlReply,
  twimlResponse,
  validateTwilioSignature,
} from '@/lib/integrations/twilio';
import { absoluteUrl, readTwilioForm, requestUrl, resolveWorkspaceByNumber } from '@/lib/voice';
import { generateAgentReply } from '@/lib/ai';
import type { ChatMessage } from '@/lib/ai/adapter';

/**
 * Speech-to-text → AI → text-to-speech turn (spec §4.1).
 * Twilio does the STT (`SpeechResult`) and the TTS (`<Say>`); Roster owns the
 * middle. The running transcript is appended to the call row each turn.
 */
export const POST = withPublic(async (req) => {
  const form = await readTwilioForm(req);
  const callSid = form.CallSid ?? '';
  const speech = (form.SpeechResult ?? '').trim();
  const to = form.To ?? '';

  const workspaceId = await resolveWorkspaceByNumber(to);
  if (!workspaceId) return twimlResponse(twimlHangup('Sorry, something went wrong.'));

  const signatureValid = await validateTwilioSignature(
    workspaceId,
    req.headers.get('x-twilio-signature'),
    requestUrl(req),
    form,
  );
  if (!signatureValid) return new Response('Invalid Twilio signature', { status: 403 });

  const call = await prisma.call.findUnique({ where: { providerCallSid: callSid } });

  // Empty speech means silence — say goodbye rather than looping forever.
  if (!speech) {
    return twimlResponse(
      twimlHangup("I didn't catch that. Please call back when you're ready. Goodbye."),
    );
  }

  const transcript = call?.transcript ?? '';
  const history: ChatMessage[] = parseTranscript(transcript);
  history.push({ role: 'user', content: speech });

  let replyText =
    "I'm having trouble with that right now. Someone from our team will call you back shortly.";

  try {
    const reply = await generateAgentReply({
      workspaceId,
      history,
      channel: 'voice',
      // Voice is latency-critical — keep effort low and the reply short.
      effort: 'low',
    });
    if (reply.text.trim()) replyText = reply.text.trim();

    if (reply.escalate && call) {
      await prisma.call.update({
        where: { id: call.id },
        data: { summary: 'Caller asked for a human — needs follow-up.' },
      });
    }
  } catch (error) {
    console.error('[voice] agent reply failed', (error as Error).message);
  }

  if (call) {
    await prisma.call.update({
      where: { id: call.id },
      data: {
        transcript: `${transcript}\nCaller: ${speech}\nAgent: ${replyText}`.trim(),
      },
    });
  }

  return twimlResponse(twimlReply(replyText, absoluteUrl('/api/voice/respond')));
});

/** Rebuilds chat history from the "Caller:/Agent:" transcript we append to. */
function parseTranscript(transcript: string): ChatMessage[] {
  if (!transcript.trim()) return [];

  return transcript
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): ChatMessage | null => {
      if (line.startsWith('Caller:')) {
        return { role: 'user', content: line.slice(7).trim() };
      }
      if (line.startsWith('Agent:')) {
        return { role: 'assistant', content: line.slice(6).trim() };
      }
      return null;
    })
    .filter((m): m is ChatMessage => m !== null)
    .slice(-20);
}
