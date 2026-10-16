'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Archive,
  ArchiveRestore,
  Bot,
  ExternalLink,
  Inbox as InboxIcon,
  Mail,
  MessageSquare,
  Phone,
  Send,
  User,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  Tabs,
  Textarea,
  useToast,
} from '@/components/ui';
import { cn, relativeTime, truncate } from '@/lib/utils';

type Conversation = {
  id: string;
  channel: string;
  subject: string | null;
  isOpen: boolean;
  needsHuman: boolean;
  lastMessageAt: string;
  contact: { id: string; name: string; email: string | null; phone: string | null } | null;
  agent: { id: string; name: string } | null;
  messages: { body: string }[];
};

type Message = {
  id: string;
  direction: 'in' | 'out';
  sender: 'ai' | 'human' | 'contact' | 'system';
  body: string;
  createdAt: string;
};

const CHANNEL_ICON: Record<string, typeof MessageSquare> = {
  chat: MessageSquare,
  sms: Phone,
  whatsapp: Phone,
  email: Mail,
  voice: Phone,
};

/** Unified inbox: one threaded view per contact across every channel (spec §4.7). */
export function InboxClient({
  initialConversationId,
  initialContactId,
}: {
  initialConversationId?: string;
  initialContactId?: string;
}) {
  const t = useTranslations('inbox');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [channelCounts, setChannelCounts] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  // A deep link from a push notification should win exactly once.
  const contactResolved = useRef(false);
  const toast = useToast();

  const loadConversations = useCallback(async () => {
    setListError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filter === 'needs_human') params.set('filter', 'needs_human');
      if (filter === 'all' || filter === 'closed') params.set('filter', 'all');

      const res = await fetch(`/api/inbox?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setListError(data.error ?? 'Could not load conversations.');
        return;
      }

      let list: Conversation[] = data.conversations ?? [];
      if (filter === 'closed') list = list.filter((c) => !c.isOpen);

      setConversations(list);
      setChannelCounts(data.channelCounts ?? {});

      // ?contact= comes from push notifications and the contact record; resolve
      // it to that contact's most recent thread.
      if (initialContactId && !contactResolved.current) {
        contactResolved.current = true;
        const match = list.find((c) => c.contact?.id === initialContactId);
        if (match) {
          setSelectedId(match.id);
          return;
        }
      }

      setSelectedId((current) => {
        if (current && list.some((c) => c.id === current)) return current;
        return current ?? list[0]?.id ?? null;
      });
    } catch {
      setListError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [filter, initialContactId]);

  const loadThread = useCallback(async (id: string) => {
    setThreadError('');
    try {
      const res = await fetch(`/api/inbox/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setThreadError(data.error ?? 'Could not load this conversation.');
        return;
      }
      setMessages(data.conversation?.messages ?? []);
    } catch {
      setThreadError('Could not reach the server.');
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
  }, [selectedId, loadThread]);

  // Poll the open thread so an inbound reply appears without a refresh.
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setInterval(() => {
      void loadThread(selectedId);
      void loadConversations();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [selectedId, loadThread, loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const send = async () => {
    if (!draft.trim() || !selected) return;

    setSending(true);
    try {
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, body: draft.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.show(data.error ?? 'Could not send that message.', 'alert');
        return;
      }

      setDraft('');
      await loadThread(selected.id);
      await loadConversations();
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setSending(false);
    }
  };

  const setOpenState = async (conversation: Conversation, isOpen: boolean) => {
    const res = await fetch(`/api/inbox/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isOpen }),
    });
    if (!res.ok) {
      toast.show('Could not update this conversation.', 'alert');
      return;
    }
    toast.show(isOpen ? 'Conversation reopened.' : 'Conversation closed.', 'success');
    await loadConversations();
  };

  const totalOpen = Object.values(channelCounts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title={t('inbox')}
        description={t('everyChannelOneThreadPer')}
      />

      <Tabs
        label={t('conversationFilters')}
        tabs={[
          { key: 'open', label: 'Open', count: totalOpen || undefined },
          { key: 'needs_human', label: 'Needs you' },
          { key: 'closed', label: 'Closed' },
          { key: 'all', label: 'All' },
        ]}
        active={filter}
        onChange={(key) => {
          setFilter(key);
          setSelectedId(null);
        }}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[330px_1fr]">
        <Card className="flex max-h-[calc(100vh-15rem)] flex-col overflow-hidden">
          {listError ? (
            <ErrorBlock message={listError} onRetry={() => void loadConversations()} />
          ) : loading ? (
            <LoadingBlock label={t('loadingConversations')} />
          ) : conversations.length ? (
            <ul className="scrollbar-thin divide-y divide-[color:var(--color-border)] overflow-y-auto">
              {conversations.map((conversation) => {
                const Icon = CHANNEL_ICON[conversation.channel] ?? MessageSquare;
                const active = conversation.id === selectedId;

                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(conversation.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'w-full px-4 py-3 text-start transition-colors duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                        active
                          ? 'bg-accent/10'
                          : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 shrink-0 muted" strokeWidth={1.75} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {conversation.contact?.name ?? 'Website visitor'}
                        </span>
                        {conversation.needsHuman && <Badge tone="warning">{t('needsYou')}</Badge>}
                        {!conversation.isOpen && <Badge>closed</Badge>}
                      </div>
                      <p className="mt-1 truncate text-xs muted">
                        {truncate(conversation.messages[0]?.body ?? 'No messages', 52)}
                      </p>
                      <p className="mt-1 text-[11px] muted">
                        {relativeTime(conversation.lastMessageAt)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={<InboxIcon strokeWidth={1.75} />}
              title={filter === 'open' ? 'Inbox is clear' : 'Nothing here'}
              description={t('conversationsFromChatSmsEmail')}
            />
          )}
        </Card>

        <Card className="flex max-h-[calc(100vh-15rem)] flex-col">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--color-border)] px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {selected.contact?.name ?? 'Website visitor'}
                    </p>
                    {selected.contact && (
                      <Link
                        href={`/dashboard/contacts/${selected.contact.id}`}
                        title={t('openContactRecord')}
                        className="rounded-control p-1 muted transition-colors hover:text-[color:var(--color-fg)]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </Link>
                    )}
                  </div>
                  <p className="truncate text-xs muted">
                    {selected.channel}
                    {selected.contact?.phone ? ` · ${selected.contact.phone}` : ''}
                    {selected.contact?.email ? ` · ${selected.contact.email}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {selected.agent && (
                    <Badge tone="accent">
                      <Bot className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                      {selected.agent.name}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void setOpenState(selected, !selected.isOpen)}
                  >
                    {selected.isOpen ? (
                      <>
                        <Archive className="h-4 w-4" strokeWidth={1.75} />{t('close')}</>
                    ) : (
                      <>
                        <ArchiveRestore className="h-4 w-4" strokeWidth={1.75} />{t('reopen')}</>
                    )}
                  </Button>
                </div>
              </div>

              {threadError ? (
                <ErrorBlock
                  message={threadError}
                  onRetry={() => selectedId && void loadThread(selectedId)}
                />
              ) : (
                <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {messages.map((message) => {
                    const outbound = message.direction === 'out';
                    return (
                      <div
                        key={message.id}
                        className={cn('flex gap-2.5', outbound && 'flex-row-reverse')}
                      >
                        <span
                          aria-hidden
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border border-[color:var(--color-border)]"
                        >
                          {message.sender === 'ai' ? (
                            <Bot className="h-3 w-3" strokeWidth={1.75} />
                          ) : (
                            <User className="h-3 w-3" strokeWidth={1.75} />
                          )}
                        </span>
                        <div className={cn('max-w-[75%]', outbound && 'text-end')}>
                          <div
                            className={cn(
                              'inline-block whitespace-pre-wrap rounded-card border px-3 py-2 text-start text-sm leading-relaxed',
                              outbound
                                ? 'border-accent/30 bg-accent/10'
                                : 'border-[color:var(--color-border)] bg-[color:var(--color-bg)]',
                            )}
                          >
                            {message.body}
                          </div>
                          <p className="mt-1 text-[11px] muted">
                            {message.sender === 'ai' ? 'AI agent' : message.sender} ·{' '}
                            {relativeTime(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              )}

              <div className="border-t border-[color:var(--color-border)] p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
                    }}
                    aria-label={`Reply via ${selected.channel}`}
                    placeholder={`Reply via ${selected.channel}…  (⌘↵ to send)`}
                    className="min-h-[60px]"
                  />
                  <Button
                    variant="primary"
                    loading={sending}
                    disabled={!draft.trim()}
                    onClick={() => void send()}
                    aria-label={t('sendReply')}
                  >
                    <Send className="h-4 w-4" strokeWidth={1.75} />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<MessageSquare strokeWidth={1.75} />}
              title={t('pickAConversation')}
              description={t('selectAThreadOnThe')}
            />
          )}
        </Card>
      </div>

      {toast.node}
    </>
  );
}
