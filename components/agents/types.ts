/** Shapes shared by the AI Agents panels. */

export type Agent = {
  id: string;
  name: string;
  provider: 'claude' | 'openai';
  model: string;
  personaPrompt: string;
  greeting: string | null;
  tone: string;
  channels: string[];
  maxTokens: number;
  isActive: boolean;
  isDefault: boolean;
  escalationRules: { keywords?: string[]; afterTurns?: number } | null;
};

export type ModelCatalog = Record<string, { id: string; label: string; note?: string }[]>;

export type DocKind = 'doc' | 'faq' | 'pricing' | 'policy';

export type KnowledgeDoc = {
  id: string;
  title: string;
  kind: string;
  content: string;
  tokens: number;
  /** null means the document is shared by every agent in the workspace. */
  agentId: string | null;
};

export const TONES = ['professional', 'friendly', 'concise', 'enthusiastic', 'formal'];
export const CHANNELS = ['chat', 'sms', 'whatsapp', 'email', 'voice'];
export const DOC_KINDS: DocKind[] = ['doc', 'faq', 'pricing', 'policy'];

/** Cheap change-detection: has anything the buyer edits actually moved? */
export function fingerprint(agent: Agent) {
  return JSON.stringify({
    name: agent.name, provider: agent.provider, model: agent.model,
    personaPrompt: agent.personaPrompt, greeting: agent.greeting, tone: agent.tone,
    channels: [...agent.channels].sort(), maxTokens: agent.maxTokens,
    isActive: agent.isActive, isDefault: agent.isDefault,
    escalationRules: agent.escalationRules,
  });
}

export const estimateTokens = (content: string) => Math.ceil(content.length / 4);

export type ChatMessage = { role: 'user' | 'assistant'; text: string; error?: string };
