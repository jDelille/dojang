'use client';

import { useRef, useState } from 'react';

export type Turn = { role: 'user' | 'agent'; text: string; error?: boolean; mode?: string };

/**
 * Streams a reply from the workspace's agent (/api/agents/[id]/chat, SSE).
 * `shown` is what the thread displays; `sent` may add page context for the
 * agent. One conversation per panel session.
 */
export function useAgentChat(agentId: string | null, errorText: string) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(null);

  /** Adds finished turns from elsewhere (Odoo's answers) to the same thread. */
  const add = (...more: Turn[]) => setTurns((current) => [...current, ...more]);

  const ask = async (shown: string, sent = shown, mode?: string, withUserTurn = true) => {
    const message = sent.trim();
    if (!message || busy || !agentId) return;
    setBusy(true);
    setTurns((current) => [
      ...current,
      ...(withUserTurn ? [{ role: 'user' as const, text: shown.trim() }] : []),
      { role: 'agent', text: '', mode },
    ]);

    const patchLast = (update: (turn: Turn) => Turn) =>
      setTurns((current) => [...current.slice(0, -1), update(current[current.length - 1])]);

    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId: conversationId.current }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? errorText);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const raw of events) {
          const lines = raw.split('\n');
          const event = lines.find((l) => l.startsWith('event: '))?.slice(7).trim();
          const dataLine = lines.find((l) => l.startsWith('data: '));
          if (!event || !dataLine) continue;
          let payload: { text?: string; message?: string; conversationId?: string };
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }
          if (event === 'meta' && payload.conversationId) conversationId.current = payload.conversationId;
          if (event === 'token' && payload.text) {
            const piece = payload.text;
            patchLast((turn) => ({ ...turn, text: turn.text + piece }));
          }
          if (event === 'error') {
            const msg = payload.message ?? errorText;
            patchLast((turn) => ({ ...turn, text: turn.text || msg, error: !turn.text }));
          }
        }
      }
    } catch (error) {
      patchLast((turn) => ({ ...turn, text: (error as Error).message || errorText, error: true }));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setTurns([]);
    conversationId.current = null;
  };

  return { turns, busy, ask, add, clear };
}
