'use client';
import type { ChatMessage } from '@/components/agents/types';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, RotateCcw, Send } from 'lucide-react';
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorBlock,
  Field, Input, LoadingBlock, Modal, PageHeader, Select, Spinner, StatusDot, Switch,
  Tabs, Textarea, Td, Th, Tr, Table, useToast,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Agent } from '@/components/agents/types';

export function TestChat({
  agentId,
  agentName,
  isActive,
}: {
  agentId: string;
  agentName: string;
  isActive: boolean;
}) {
  const t = useTranslations('agents');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Leaving the tab must stop the request, not stream into a dead component.
  useEffect(() => () => abortRef.current?.abort(), []);

  const replaceLast = (patch: (last: ChatMessage) => ChatMessage) =>
    setMessages((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      next[next.length - 1] = patch(next[next.length - 1]);
      return next;
    });

  const send = async () => {
    const text = draft.trim();
    if (!text || streaming) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setDraft('');
    setMessages((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: '' }]);
    setStreaming(true);

    let finished = false;

    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        finished = true;
        replaceLast(() => ({
          role: 'assistant',
          text: '',
          error: data.error ?? 'Something went wrong. Try sending that again.',
        }));
        return;
      }

      // Parse the SSE stream produced by /api/agents/[id]/chat.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const lines = frame.split('\n');
          const eventLine = lines.find((l) => l.startsWith('event: '));
          const dataLine = lines.find((l) => l.startsWith('data: '));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7).trim();
          // A truncated frame must not end the whole stream — skip it.
          let payload: { conversationId?: string; text?: string; message?: string };
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          if (event === 'meta' && payload.conversationId) {
            setConversationId(payload.conversationId);
          }
          if (event === 'token') {
            const chunk = payload.text ?? '';
            replaceLast((last) => ({ role: 'assistant', text: last.text + chunk }));
          }
          if (event === 'error') {
            finished = true;
            replaceLast((last) => ({
              role: 'assistant',
              text: last.text,
              error: payload.message ?? 'The agent could not answer.',
            }));
          }
          if (event === 'done') finished = true;
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        finished = true;
        replaceLast((last) => ({
          role: 'assistant',
          text: last.text,
          error: 'The connection dropped. Send that again to retry.',
        }));
      }
    } finally {
      if (!controller.signal.aborted) {
        // A stream that stops without a done event leaves a half sentence on
        // screen, which reads as the agent still thinking.
        if (!finished) {
          replaceLast((last) => ({
            role: 'assistant',
            text: last.text,
            error: 'The reply stopped early. Send that again to retry.',
          }));
        }
        setStreaming(false);
        abortRef.current = null;
      }
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages([]);
    setConversationId(null);
  };

  return (
    <Card className="flex h-[560px] flex-col">
      <CardHeader
        title={`Test ${agentName}`}
        description={t('thisIsARealConversation')}
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!messages.length}
            onClick={reset}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />{t('newConversation')}</Button>
        }
      />

      {!isActive && (
        <p className="border-b border-[color:var(--color-border)] px-5 py-2 text-xs muted">{t('thisAgentIsPausedSo')}</p>
      )}

      <div
        aria-live="polite"
        aria-atomic="false"
        className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-5 py-4"
      >
        {!messages.length && (
          <p className="py-12 text-center text-xs muted">{t('saySomethingACustomerWould')}</p>
        )}
        {messages.map((message, i) => (
          <div key={i} className={cn('flex', message.role === 'user' && 'justify-end')}>
            <div
              className={cn(
                'max-w-[75%] whitespace-pre-wrap rounded-card border px-3 py-2 text-sm',
                message.role === 'user'
                  ? 'border-accent/30 bg-accent/10'
                  : 'border-[color:var(--color-border)] bg-[color:var(--color-bg)]',
                message.error && 'border-alert/40',
              )}
            >
              {message.text}
              {!message.text && !message.error && (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner className="h-3.5 w-3.5" label={t('waitingForTheAgent')} />
                  <span className="muted">thinking…</span>
                </span>
              )}
              {message.error && (
                <p className={cn('text-xs text-alert', message.text && 'mt-1.5')}>{message.error}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[color:var(--color-border)] p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            aria-label={`Message ${agentName}`}
            placeholder={t('doYouDoEmergencyCallouts')}
            className="min-h-[52px]"
          />
          <Button
            type="button"
            variant="primary"
            loading={streaming}
            aria-label={t('sendMessage')}
            onClick={() => void send()}
          >
            <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </Button>
        </div>
      </div>
    </Card>
  );
}
