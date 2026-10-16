import Anthropic from '@anthropic-ai/sdk';
import {
  AiConfigError,
  type AiProviderAdapter,
  type ChatRequest,
  type ChatResult,
  type StreamChunk,
} from '@/lib/ai/adapter';

/**
 * Anthropic (Claude) adapter.
 *
 * Notes on request shape:
 *  - Claude Opus 5 runs adaptive thinking by default, so `thinking` is omitted
 *    rather than configured. `budget_tokens` is rejected with a 400 on Opus 5
 *    / Opus 4.7+ — never send it.
 *  - `output_config.effort` is GA but not present in this SDK version's
 *    typings, so it's attached as an extra body field. Only sent for models
 *    that support it; older models reject the parameter.
 *  - Live chat defaults to effort "low" for latency; summarization and review
 *    drafting pass "medium"/"high".
 */

const EFFORT_CAPABLE = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-fable-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-opus-4-5',
];

function supportsEffort(model: string) {
  return EFFORT_CAPABLE.some((m) => model.startsWith(m));
}

export class ClaudeAdapter implements AiProviderAdapter {
  readonly id = 'claude' as const;
  readonly label = 'Claude (Anthropic)';

  private client: Anthropic;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new AiConfigError(
        'No Anthropic API key configured. Add one in Settings → Integrations.',
      );
    }
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  private buildParams(request: ChatRequest) {
    const params: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 2048,
      system: request.system,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    };

    if (supportsEffort(request.model)) {
      // Extra body field: GA on the API, absent from this SDK version's types.
      params.output_config = { effort: request.effort ?? 'low' };
    }

    return params;
  }

  async complete(request: ChatRequest): Promise<ChatResult> {
    const params = this.buildParams(request);

    // Stream even for one-shot calls — it avoids HTTP timeouts on long outputs
    // and `finalMessage()` gives us the assembled response either way.
    const stream = this.client.messages.stream(params as never);
    const message = await stream.finalMessage();

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text,
      model: message.model,
      stopReason: message.stop_reason,
      refused: message.stop_reason === 'refusal',
      usage: {
        inputTokens: message.usage.input_tokens ?? 0,
        outputTokens: message.usage.output_tokens ?? 0,
      },
    };
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const params = this.buildParams(request);

    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: string | null = null;

    try {
      const stream = this.client.messages.stream(params as never);

      for await (const event of stream) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage?.input_tokens ?? 0;
        }
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
        if (event.type === 'message_delta') {
          outputTokens = event.usage?.output_tokens ?? outputTokens;
          stopReason = event.delta.stop_reason ?? stopReason;
        }
      }

      // Safety classifiers can decline with HTTP 200 + stop_reason "refusal".
      if (stopReason === 'refusal') {
        yield {
          type: 'text',
          text: "I'm not able to help with that request. Let me connect you with a team member.",
        };
      }

      yield { type: 'done', usage: { inputTokens, outputTokens }, stopReason };
    } catch (error) {
      yield { type: 'error', message: toFriendlyError(error) };
    }
  }

  async verify() {
    try {
      await this.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: toFriendlyError(error) };
    }
  }
}

function toFriendlyError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'Anthropic rejected the API key. Check it in Settings → Integrations.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Anthropic rate limit reached. Try again shortly.';
  }
  if (error instanceof Anthropic.NotFoundError) {
    return 'That Claude model is not available on this API key.';
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic error (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unknown Anthropic error.';
}
