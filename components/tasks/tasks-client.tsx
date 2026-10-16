'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { CheckSquare, Plus, Trash2, User } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Tabs,
  useToast,
} from '@/components/ui';
import { StatTile } from '@/components/charts';
import { cn, formatDate } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  contact: { id: string; name: string | null } | null;
  assignee: { id: string; name: string | null; email: string } | null;
}

interface Teammate {
  id: string;
  name: string | null;
  email: string;
}

/**
 * Overdue / due today / later — the only grouping an operator acts on.
 *
 * `dayStart` is midnight in the *workspace's* timezone, supplied by the API,
 * so a colleague viewing from another country sees the same buckets and the
 * same overdue count.
 */
function bucketOf(task: Task, dayStart: number): 'overdue' | 'today' | 'later' | 'undated' {
  if (!task.dueAt) return 'undated';
  const due = new Date(task.dueAt).getTime();
  if (due < dayStart) return 'overdue';
  if (due < dayStart + 86_400_000) return 'today';
  return 'later';
}

const BUCKET_LABEL = {
  overdue: 'Overdue',
  today: 'Due today',
  later: 'Later',
  undated: 'No due date',
} as const;

export function TasksClient({ teammates, currentUserId }: { teammates: Teammate[]; currentUserId: string }) {
  const t = useTranslations('tasks');
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [dayStart, setDayStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });
  const [scope, setScope] = useState('open');
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const [draft, setDraft] = useState({ title: '', dueAt: '', assigneeId: currentUserId });

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/tasks?scope=${scope}${mine ? '&mine=1' : ''}`);
      if (!res.ok) throw new Error('Could not load your tasks.');
      const data = await res.json();
      setTasks(data.tasks ?? []);
      setOpenCount(data.openCount ?? 0);
      setOverdueCount(data.overdueCount ?? 0);
      if (data.startOfToday) setDayStart(new Date(data.startOfToday).getTime());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [scope, mine]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (task: Task) => {
    const completing = !task.completedAt;
    // Optimistic: ticking a checkbox should feel instant, and the reload
    // below is authoritative if the request loses.
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, completedAt: completing ? new Date().toISOString() : null } : t,
      ),
    );
    setOpenCount((n) => Math.max(0, n + (completing ? -1 : 1)));

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: completing }),
    });
    if (!res.ok) {
      toast.show('Could not update that task.', 'alert');
    }
    void load();
  };

  const create = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          // <input type="date"> gives a bare day; anchor it to 9am local so
          // "due today" does not mean "due at midnight, already overdue".
          dueAt: draft.dueAt ? new Date(`${draft.dueAt}T09:00:00`).toISOString() : null,
          assigneeId: draft.assigneeId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.show(data.error ?? 'Could not create that task.', 'alert');
        return;
      }
      toast.show('Task added.', 'success');
      setCreating(false);
      setDraft({ title: '', dueAt: '', assigneeId: currentUserId });
      void load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (task: Task) => {
    const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    if (!res.ok) return toast.show('Could not delete that task.', 'alert');
    toast.show('Task deleted.', 'success');
    setConfirmDelete(null);
    void load();
  };

  const grouped = useMemo(() => {
    const order: Array<keyof typeof BUCKET_LABEL> = ['overdue', 'today', 'later', 'undated'];
    return order
      .map((key) => ({
        key,
        label: BUCKET_LABEL[key],
        items: tasks.filter((t) => bucketOf(t, dayStart) === key),
      }))
      .filter((g) => g.items.length > 0);
  }, [tasks, dayStart]);

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={t('openTasks')} value={openCount} />
        <StatTile
          label={t('overdue')}
          value={overdueCount}
          tone={overdueCount > 0 ? 'warning' : 'neutral'}
        />
        <StatTile label={t('showing')} value={tasks.length} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { key: 'open', label: 'Open' },
            { key: 'done', label: 'Done' },
            { key: 'all', label: 'All' },
          ]}
          active={scope}
          onChange={setScope}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant={mine ? 'primary' : 'secondary'} onClick={() => setMine((m) => !m)}>
            <User className="h-4 w-4" strokeWidth={1.75} />
            {mine ? 'Mine only' : 'Everyone'}
          </Button>
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />{t('newTask')}</Button>
        </div>
      </div>

      {loading ? (
        <LoadingBlock label={t('loadingTasks')} />
      ) : error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : tasks.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<CheckSquare strokeWidth={1.75} />}
              title={scope === 'done' ? 'Nothing completed yet' : 'No tasks right now'}
              description={t('retentionRulesWithACreate')}
              action={
                <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" strokeWidth={1.75} />{t('newTask')}</Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <section key={group.key}>
              <h2
                className={cn(
                  'label-caps mb-2',
                  group.key === 'overdue' && 'text-warning',
                )}
              >
                {group.label} · {group.items.length}
              </h2>
              <Card>
                <ul className="divide-y divide-[color:var(--color-border)]">
                  {group.items.map((task) => (
                    <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(task.completedAt)}
                        onChange={() => void toggle(task)}
                        aria-label={`Mark “${task.title}” as ${task.completedAt ? 'not done' : 'done'}`}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[color:var(--color-accent)]"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-sm',
                            task.completedAt && 'text-[color:var(--color-fg-muted)] line-through',
                          )}
                        >
                          {task.title}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs muted">
                          {task.dueAt && (
                            <span className={cn(bucketOf(task, dayStart) === 'overdue' && 'text-warning')}>
                              Due {formatDate(task.dueAt)}
                            </span>
                          )}
                          {task.contact && (
                            <>
                              {task.dueAt && <span aria-hidden>·</span>}
                              <Link
                                href={`/dashboard/contacts/${task.contact.id}`}
                                className="underline underline-offset-4"
                              >
                                {task.contact.name ?? 'Contact'}
                              </Link>
                            </>
                          )}
                          {task.assignee && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{task.assignee.name ?? task.assignee.email}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete “${task.title}”`}
                        onClick={() => setConfirmDelete(task)}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('newTask')}
        description={t('aReminderForYouOr')}
        onSubmit={() => void create()}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>{t('cancel')}</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!draft.title.trim()}>{t('addTask')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('whatNeedsDoing')} required>
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder={t('callTheFerndaleJobBack')}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('dueDate')}>
              <Input
                type="date"
                value={draft.dueAt}
                onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })}
              />
            </Field>
            <Field label={t('assignTo')}>
              <Select
                value={draft.assigneeId}
                onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })}
              >
                {teammates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name ?? t.email}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        title={t('deleteThisTask')}
        description={confirmDelete ? `“${confirmDelete.title}” will be removed for everyone.` : ''}
        confirmLabel={t('delete')}
        destructive
      />
    </>
  );
}
