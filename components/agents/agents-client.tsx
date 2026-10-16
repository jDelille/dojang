'use client';
import { AgentConfig } from '@/components/agents/agent-config';
import { KnowledgeBase } from '@/components/agents/knowledge-base';
import { TestChat } from '@/components/agents/test-chat';
import { EmbedSnippet, CreateAgentModal } from '@/components/agents/embed-snippet';
import type { Agent, ModelCatalog } from '@/components/agents/types';
import { estimateTokens } from '@/components/agents/types';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, BookOpen, Check, Copy, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatusDot,
  Switch,
  Tabs,
  Textarea,
  useToast,
} from '@/components/ui';
import { cn } from '@/lib/utils';

/** Rough parity with the server's estimate in /api/agents/knowledge. */

export function AgentsClient({ workspaceSlug, appUrl }: { workspaceSlug: string; appUrl: string }) {
  const t = useTranslations('agents');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<ModelCatalog>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState('config');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<{ run: () => void } | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? 'Could not load your agents.');
        return;
      }
      const list: Agent[] = data.agents ?? [];
      setAgents(list);
      setModels(data.models ?? {});
      setSelectedId((current) =>
        current && list.some((a) => a.id === current) ? current : (list[0]?.id ?? null),
      );
    } catch {
      setLoadError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = agents.find((a) => a.id === selectedId) ?? null;

  // Configuration edits live in AgentConfig's own state, so anything that
  // remounts or re-seeds it has to be confirmed first or the persona is lost.
  const guard = (run: () => void) => {
    if (!dirty) {
      run();
      return;
    }
    setPendingNav({ run });
  };

  if (loading) {
    return <LoadingBlock label={t('loadingAgents')} />;
  }

  if (loadError) {
    return <ErrorBlock message={loadError} onRetry={() => void load()} />;
  }

  return (
    <>
      <PageHeader
        title={t('aiAgents')}
        description={t('personaProviderModelAndKnowledge')}
        actions={
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => guard(() => setCreateOpen(true))}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />{t('newAgent')}</Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <Card>
          {agents.length ? (
            <ul className="divide-y divide-[color:var(--color-border)]">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <button
                    type="button"
                    onClick={() => guard(() => setSelectedId(agent.id))}
                    aria-current={agent.id === selectedId ? 'true' : undefined}
                    className={cn(
                      'w-full px-4 py-3 text-start transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                      agent.id === selectedId
                        ? 'bg-accent/10'
                        : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5 shrink-0 muted" strokeWidth={1.75} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {agent.name}
                      </span>
                      {agent.isDefault && <Badge tone="accent">{t('default')}</Badge>}
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] muted">{agent.model}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px]">
                      <StatusDot tone={agent.isActive ? 'success' : 'neutral'} />
                      <span className={agent.isActive ? 'text-success' : 'muted'}>
                        {agent.isActive ? 'Live' : 'Paused'}
                      </span>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Bot strokeWidth={1.75} />}
              title={t('noAgents')}
              description={t('createYourFirstAiAgent')}
              action={
                <Button type="button" variant="primary" size="sm" onClick={() => setCreateOpen(true)}>{t('newAgent')}</Button>
              }
            />
          )}
        </Card>

        <div>
          {selected ? (
            <>
              <Tabs
                label={t('agentSections')}
                tabs={[
                  { key: 'config', label: 'Configuration' },
                  { key: 'knowledge', label: 'Knowledge base' },
                  { key: 'test', label: 'Test chat' },
                  { key: 'embed', label: 'Website widget' },
                ]}
                active={tab}
                onChange={(key) => guard(() => setTab(key))}
              />
              <div className="mt-4">
                {tab === 'config' && (
                  <AgentConfig
                    agent={selected}
                    models={models}
                    onDirtyChange={setDirty}
                    onSaved={(updated) => {
                      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
                      toast.show('Agent saved.', 'success');
                    }}
                    onDeleted={() => {
                      setDirty(false);
                      setSelectedId(null);
                      toast.show('Agent deleted.', 'success');
                      void load();
                    }}
                    onError={(m) => toast.show(m, 'alert')}
                  />
                )}
                {tab === 'knowledge' && (
                  <KnowledgeBase
                    key={selected.id}
                    agentId={selected.id}
                    onError={(m) => toast.show(m, 'alert')}
                    onSaved={(m) => toast.show(m, 'success')}
                  />
                )}
                {tab === 'test' && (
                  <TestChat
                    key={selected.id}
                    agentId={selected.id}
                    agentName={selected.name}
                    isActive={selected.isActive}
                  />
                )}
                {tab === 'embed' && <EmbedSnippet slug={workspaceSlug} appUrl={appUrl} toast={toast} />}
              </div>
            </>
          ) : (
            <Card>
              <EmptyState
                icon={<Bot strokeWidth={1.75} />}
                title={t('selectAnAgent')}
                description={t('pickAnAgentOnThe')}
              />
            </Card>
          )}
        </div>
      </div>

      <CreateAgentModal
        open={createOpen}
        models={models}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          toast.show('Agent created.', 'success');
          void load();
        }}
        onError={(m) => toast.show(m, 'alert')}
      />

      <ConfirmDialog
        open={pendingNav !== null}
        onClose={() => setPendingNav(null)}
        onConfirm={() => {
          setDirty(false);
          pendingNav?.run();
          setPendingNav(null);
        }}
        title={t('discardUnsavedChanges')}
        description={t('thisAgentHasEditsThat')}
        confirmLabel={t('discardChanges')}
        destructive
      />

      {toast.node}
    </>
  );
}


