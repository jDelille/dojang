/**
 * Provider-agnostic AI interface (spec §4.1).
 *
 * Both providers in /lib/ai/providers implement `AiProviderAdapter`, so a
 * buyer can point one agent at Claude and another at OpenAI, or add a third
 * provider later without touching any calling code.
 */

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  system: string;
  messages: ChatMessage[];
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** Lower effort = faster replies. Live chat defaults to 'low'. */
  effort?: 'low' | 'medium' | 'high';
};

export type ChatUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type ChatResult = {
  text: string;
  usage: ChatUsage;
  model: string;
  stopReason?: string | null;
  /** True when the provider declined the request on safety grounds. */
  refused?: boolean;
};

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'done'; usage: ChatUsage; stopReason?: string | null }
  | { type: 'error'; message: string };

export interface AiProviderAdapter {
  readonly id: 'claude' | 'openai';
  readonly label: string;

  /** One-shot completion. Used by summarizers, review drafts, lead scoring. */
  complete(request: ChatRequest): Promise<ChatResult>;

  /** Token-by-token stream for the chat widget and inbox composer. */
  stream(request: ChatRequest): AsyncGenerator<StreamChunk>;

  /** Cheap credential check for Settings → Integrations. */
  verify(): Promise<{ ok: boolean; message?: string }>;
}

/** Models offered in the agent config dropdown. */
export const MODEL_CATALOG: Record<'claude' | 'openai', { id: string; label: string; note?: string }[]> = {
  claude: [
    { id: 'claude-opus-5', label: 'Claude Opus 5', note: 'Best reasoning — recommended' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: 'Fast, near-Opus quality' },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'Cheapest, high volume' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', note: 'Cheapest, high volume' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
};

export const DEFAULT_MODEL: Record<'claude' | 'openai', string> = {
  claude: 'claude-opus-5',
  openai: 'gpt-4o-mini',
};

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigError';
  }
}

/** Collapses a stream into a single result — handy for non-UI callers. */
export async function collectStream(
  gen: AsyncGenerator<StreamChunk>,
): Promise<ChatResult & { model: string }> {
  let text = '';
  let usage: ChatUsage = { inputTokens: 0, outputTokens: 0 };
  let stopReason: string | null | undefined;

  for await (const chunk of gen) {
    if (chunk.type === 'text') text += chunk.text;
    if (chunk.type === 'done') {
      usage = chunk.usage;
      stopReason = chunk.stopReason;
    }
    if (chunk.type === 'error') throw new Error(chunk.message);
  }

  return { text, usage, stopReason, model: '' };
}
