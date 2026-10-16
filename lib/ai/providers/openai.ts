import OpenAI from 'openai';
import {
  AiConfigError,
  type AiProviderAdapter,
  type ChatRequest,
  type ChatResult,
  type StreamChunk,
} from '@/lib/ai/adapter';

/** OpenAI adapter — same interface as the Claude adapter (spec §4.1). */
export class OpenAiAdapter implements AiProviderAdapter {
  readonly id = 'openai' as const;
  readonly label = 'OpenAI';

  private client: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new AiConfigError(
        'No OpenAI API key configured. Add one in Settings → Integrations.',
      );
    }
    this.client = new OpenAI({ apiKey, maxRetries: 2 });
  }

  private buildMessages(request: ChatRequest) {
    return [
      { role: 'system' as const, content: request.system },
      ...request.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
  }

  async complete(request: ChatRequest): Promise<ChatResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: request.model,
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0.7,
        messages: this.buildMessages(request),
      });

      const choice = response.choices[0];
      return {
        text: choice?.message?.content ?? '',
        model: response.model,
        stopReason: choice?.finish_reason ?? null,
        refused: choice?.finish_reason === 'content_filter',
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
      };
    } catch (error) {
      throw new Error(toFriendlyError(error));
    }
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    let outputTokens = 0;
    let inputTokens = 0;
    let stopReason: string | null = null;

    try {
      const stream = await this.client.chat.completions.create({
        model: request.model,
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0.7,
        messages: this.buildMessages(request),
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content;
        if (delta) yield { type: 'text', text: delta };

        const finish = part.choices[0]?.finish_reason;
        if (finish) stopReason = finish;

        if (part.usage) {
          inputTokens = part.usage.prompt_tokens ?? inputTokens;
          outputTokens = part.usage.completion_tokens ?? outputTokens;
        }
      }

      yield { type: 'done', usage: { inputTokens, outputTokens }, stopReason };
    } catch (error) {
      yield { type: 'error', message: toFriendlyError(error) };
    }
  }

  async verify() {
    try {
      await this.client.models.list();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: toFriendlyError(error) };
    }
  }
}

function toFriendlyError(error: unknown): string {
  if (error instanceof OpenAI.AuthenticationError) {
    return 'OpenAI rejected the API key. Check it in Settings → Integrations.';
  }
  if (error instanceof OpenAI.RateLimitError) {
    return 'OpenAI rate limit reached. Try again shortly.';
  }
  if (error instanceof OpenAI.NotFoundError) {
    return 'That OpenAI model is not available on this API key.';
  }
  if (error instanceof OpenAI.APIError) {
    return `OpenAI error (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unknown OpenAI error.';
}
