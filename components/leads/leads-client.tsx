'use client';
import { GatherModal, ManualLeadModal } from '@/components/leads/lead-modals';
import { DISMISSED_JOB_KEY, PAGE_SIZE, STATUSES } from '@/components/leads/types';
import type { GatherJob, Lead, Owner } from '@/components/leads/types';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Globe,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
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
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
  useToast,
} from '@/components/ui';
import { cn, relativeTime } from '@/lib/utils';







const ownerLabel = (owner: Owner) => owner.name?.trim() || owner.email;

export function LeadsClient({ canGather }: { canGather: boolean }) {
  const t = useTranslations('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [jobs, setJobs] = useState<GatherJob[]>([]);
  const [team, setTeam] = useState<Owner[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dismissedJob, setDismissedJob] = useState<string | null>(null);
  const [gatherOpen, setGatherOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const toast = useToast();

  // Only the newest response may win: typing fires one request per pause and a
  // slow earlier one must never overwrite the list behind a faster later one.
  const requestId = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const firstLoad = useRef(true);

  const load = useCallback(
    async (opts?: { blocking?: boolean }) => {
      const id = ++requestId.current;
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      if (opts?.blocking ?? firstLoad.current) setLoading(true);
      else setRefreshing(true);

      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
        if (debouncedQuery) params.set('q', debouncedQuery);
        if (status) params.set('status', status);

        const res = await fetch(`/api/leads?${params}`, { signal: controller.signal });
        const data = await res.json();
        if (id !== requestId.current) return;

        if (!res.ok) {
          setError(data.error ?? 'Could not load leads.');
          return;
        }
        setLeads(data.leads ?? []);
        setTotal(data.total ?? 0);
        setPages(data.pages ?? 1);
        setError('');
      } catch {
        if (id !== requestId.current) return;
        setError('Could not reach the server.');
      } finally {
        if (id === requestId.current) {
          firstLoad.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [debouncedQuery, page, status],
  );

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/gather');
      const data = await res.json();
      if (res.ok) setJobs(data.jobs ?? []);
    } catch {
      // The gather banner is supplementary — a failed poll must not disturb the list.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  // Both updates land in one render, so a new search issues a single request.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setSelected([]);
  }, [debouncedQuery, page, status]);

  useEffect(() => {
    try {
      setDismissedJob(window.localStorage.getItem(DISMISSED_JOB_KEY));
    } catch {
      // Storage can be blocked; the banner just stays dismissable per session.
    }
  }, []);

  // Owner assignment needs the team list, which staff are not allowed to read.
  // Without it the owner column stays read-only rather than disappearing.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/settings/team');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setTeam(data.users ?? []);
      } catch {
        // Assigning an owner is optional; the rest of the page works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeJob = jobs.find((j) => j.status === 'queued' || j.status === 'running');
  const activeJobId = activeJob?.id ?? null;

  // Poll while a gather job is in flight so progress is visible without a refresh.
  useEffect(() => {
    if (!activeJobId) return;
    const timer = setInterval(() => {
      void loadJobs();
      void load();
    }, 4000);
    return () => clearInterval(timer);
  }, [activeJobId, load, loadJobs]);

  // The last batch of leads is written as the job finishes, after the final poll.
  const previousJobId = useRef<string | null>(null);
  useEffect(() => {
    if (activeJobId) {
      previousJobId.current = activeJobId;
    } else if (previousJobId.current) {
      previousJobId.current = null;
      void load();
    }
  }, [activeJobId, load]);

  const newestJob = jobs[0];
  const failedJob =
    newestJob && newestJob.status === 'failed' && newestJob.id !== dismissedJob ? newestJob : null;

  const dismissFailure = (id: string) => {
    setDismissedJob(id);
    try {
      window.localStorage.setItem(DISMISSED_JOB_KEY, id);
    } catch {
      // Non-fatal — the banner is gone for this session either way.
    }
  };

  const patchLeads = async (
    ids: string[],
    body: Record<string, unknown>,
    optimistic: (lead: Lead) => Lead,
    message: string,
  ) => {
    const previous = leads;
    setLeads((prev) => prev.map((l) => (ids.includes(l.id) ? optimistic(l) : l)));

    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/leads/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
        ),
      );
      const failed = results.find((r) => !r.ok);
      if (failed) {
        setLeads(previous);
        const data = await failed.json().catch(() => ({}));
        toast.show(data.error ?? message, 'alert');
        return false;
      }
      return true;
    } catch {
      // A rejected request never reaches the !ok check, so roll back here too.
      setLeads(previous);
      toast.show(message, 'alert');
      return false;
    }
  };

  const updateStatus = (id: string, next: string) =>
    patchLeads([id], { status: next }, (l) => ({ ...l, status: next }), 'Could not update that lead.');

  const updateOwner = (id: string, ownerId: string) => {
    const owner = team.find((m) => m.id === ownerId) ?? null;
    return patchLeads(
      [id],
      { ownerId: ownerId || null },
      (l) => ({ ...l, ownerId: ownerId || null, owner }),
      'Could not change the owner.',
    );
  };

  const bulkStatus = async (next: string) => {
    const ids = selected;
    const done = await patchLeads(
      ids,
      { status: next },
      (l) => ({ ...l, status: next }),
      'Could not update those leads.',
    );
    if (!done) return;
    toast.show(`${ids.length} lead${ids.length === 1 ? '' : 's'} set to ${next}.`, 'success');
    setSelected([]);
    void load();
  };

  const bulkOwner = async (ownerId: string) => {
    const ids = selected;
    const owner = team.find((m) => m.id === ownerId) ?? null;
    const done = await patchLeads(
      ids,
      { ownerId: ownerId || null },
      (l) => ({ ...l, ownerId: ownerId || null, owner }),
      'Could not change the owner.',
    );
    if (!done) return;
    toast.show(
      owner
        ? `${ids.length} lead${ids.length === 1 ? '' : 's'} assigned to ${ownerLabel(owner)}.`
        : `${ids.length} lead${ids.length === 1 ? '' : 's'} unassigned.`,
      'success',
    );
    setSelected([]);
    void load();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const ids = pendingDelete.ids;
    setDeleting(true);
    try {
      const results = await Promise.all(
        ids.map((id) => fetch(`/api/leads/${id}`, { method: 'DELETE' })),
      );
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const data = await failed.json().catch(() => ({}));
        toast.show(data.error ?? 'Could not delete those leads.', 'alert');
      } else {
        toast.show(`${ids.length} lead${ids.length === 1 ? '' : 's'} deleted.`, 'success');
      }

      setPendingDelete(null);
      setSelected([]);
      // Clearing the last row of a page would otherwise strand the user on it.
      if (leads.length - ids.length <= 0 && page > 1) setPage(page - 1);
      else void load();
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setDeleting(false);
    }
  };

  const allSelected = leads.length > 0 && selected.length === leads.length;
  const someSelected = selected.length > 0 && !allSelected;

  const toggleAll = () => setSelected(allSelected ? [] : leads.map((l) => l.id));
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const filtering = Boolean(debouncedQuery || status);

  return (
    <>
      <PageHeader
        title={t('leads')}
        description={
          filtering
            ? `${total} lead${total === 1 ? '' : 's'} match this filter`
            : `${total} lead${total === 1 ? '' : 's'} in this workspace`
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setManualOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={1.75} />{t('addLead')}</Button>
            {canGather && (
              <Button variant="primary" size="sm" onClick={() => setGatherOpen(true)}>
                <Sparkles className="h-4 w-4" strokeWidth={1.75} />{t('gatherLeads')}</Button>
            )}
          </>
        }
      />

      {activeJob && (
        <Card className="mb-4 border-accent/40">
          <CardBody className="flex flex-wrap items-center gap-3">
            <Loader2
              className="h-4 w-4 animate-spin text-[color:var(--color-accent-dark)] dark:text-accent"
              strokeWidth={1.75}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                Searching Google Maps for <strong>{activeJob.niche}</strong> in{' '}
                {activeJob.countries.join(', ')}
              </p>
              <p className="text-xs muted">
                {activeJob.foundCount} of {activeJob.targetCount} found — this runs in the
                background, you can keep working.
              </p>
            </div>
            <div className="h-1.5 w-40 overflow-hidden rounded-pill bg-[color:var(--color-border)]">
              <div
                className="h-full rounded-pill bg-accent transition-[width] duration-500"
                style={{
                  width: `${Math.min((activeJob.foundCount / activeJob.targetCount) * 100, 100)}%`,
                }}
              />
            </div>
          </CardBody>
        </Card>
      )}

      {failedJob && (
        <Card className="mb-4 border-alert/40">
          <CardBody className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-alert">{t('lastLeadSearchFailed')}</p>
              <p className="mt-1 text-xs muted">
                {failedJob.error ?? 'The search stopped before it finished.'}
              </p>
              <p className="mt-1 text-xs muted">
                {failedJob.niche} · {relativeTime(failedJob.createdAt)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label={t('dismissTheFailedSearchNotice')}
              onClick={() => dismissFailure(failedJob.id)}
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title={t('allLeads')}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {refreshing && <Spinner className="h-3.5 w-3.5" label={t('refreshingLeads')} />}
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <Search
                  className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 muted"
                  strokeWidth={1.75}
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('search')}
                  aria-label={t('searchLeads')}
                  className="h-8 w-full ps-8 text-xs sm:w-44"
                />
              </div>
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                aria-label={t('filterByStatus')}
                className="h-8 w-32 text-xs"
              >
                <option value="">{t('allStatuses')}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                aria-label={t('refreshLeads')}
                title={t('refresh')}
                onClick={() => {
                  void load();
                  void loadJobs();
                }}
              >
                <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </div>
          }
        />

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--color-border)] bg-[color:var(--color-paper)] px-4 py-2.5 dark:bg-white/[0.02]">
            <span className="text-xs font-medium tabular-nums">
              {selected.length} selected
            </span>
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) void bulkStatus(e.target.value);
              }}
              aria-label={t('setStatusForTheSelected')}
              className="h-8 w-36 text-xs"
            >
              <option value="">{t('setStatus')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            {team.length > 0 && (
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value) void bulkOwner(e.target.value === 'none' ? '' : e.target.value);
                }}
                aria-label={t('assignAnOwnerToThe')}
                className="h-8 w-44 text-xs"
              >
                <option value="">{t('assignOwner')}</option>
                <option value="none">{t('unassigned')}</option>
                {team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {ownerLabel(member)}
                  </option>
                ))}
              </Select>
            )}
            <Button
              variant="danger"
              size="sm"
              type="button"
              onClick={() =>
                setPendingDelete({
                  ids: selected,
                  label: `${selected.length} lead${selected.length === 1 ? '' : 's'}`,
                })
              }
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />{t('delete')}</Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setSelected([])}>{t('clearSelection')}</Button>
          </div>
        )}

        {error && leads.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-alert/40 bg-alert/5 px-4 py-2">
            <span className="text-xs text-alert">{error}</span>
            <Button variant="ghost" size="sm" type="button" onClick={() => void load()}>{t('tryAgain')}</Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin muted" strokeWidth={1.75} />
          </div>
        ) : error && !leads.length ? (
          <ErrorBlock message={error} onRetry={() => void load({ blocking: true })} />
        ) : leads.length ? (
          <>
            <div
              aria-busy={refreshing}
              className={cn('transition-opacity duration-150', refreshing && 'opacity-60')}
            >
              <Table caption="Leads in this workspace">
                <thead>
                  <tr>
                    <Th className="w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={toggleAll}
                        aria-label={t('selectEveryLeadOnThis')}
                        className="accent-[color:var(--color-accent)]"
                      />
                    </Th>
                    <Th>{t('business')}</Th>
                    <Th>{t('contact')}</Th>
                    <Th>{t('location')}</Th>
                    <Th align="right">{t('rating')}</Th>
                    <Th>{t('source')}</Th>
                    <Th>{t('owner')}</Th>
                    <Th>{t('added')}</Th>
                    <Th>{t('status')}</Th>
                    <Th align="right">
                      <span className="sr-only">{t('actions')}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <Tr key={lead.id}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={selected.includes(lead.id)}
                          onChange={() => toggleOne(lead.id)}
                          aria-label={`Select ${lead.businessName}`}
                          className="accent-[color:var(--color-accent)]"
                        />
                      </Td>
                      <Td>
                        <Link
                          href={`/dashboard/leads/${lead.id}`}
                          className="font-medium hover:text-[color:var(--color-accent-dark)] dark:hover:text-accent"
                        >
                          {lead.businessName}
                        </Link>
                        {lead.category && <p className="text-xs muted">{lead.category}</p>}
                      </Td>
                      <Td>
                        <div className="space-y-0.5 text-xs">
                          {lead.phone && (
                            <p className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3 muted" strokeWidth={1.75} />
                              <span className="font-mono">{lead.phone}</span>
                            </p>
                          )}
                          {lead.website && (
                            <p className="flex items-center gap-1.5">
                              <Globe className="h-3 w-3 muted" strokeWidth={1.75} />
                              <a
                                href={lead.website}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="truncate hover:underline"
                              >
                                {lead.website.replace(/^https?:\/\//, '').slice(0, 28)}
                              </a>
                            </p>
                          )}
                          {!lead.phone && !lead.website && <span className="muted">—</span>}
                        </div>
                      </Td>
                      <Td className="text-xs muted">
                        {[lead.city, lead.country].filter(Boolean).join(', ') || '—'}
                      </Td>
                      <Td align="right">
                        {lead.rating ? (
                          <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                            <Star className="h-3 w-3 text-warning" strokeWidth={1.75} />
                            {lead.rating.toFixed(1)}
                            <span className="muted">({lead.reviewCount ?? 0})</span>
                          </span>
                        ) : (
                          <span className="text-xs muted">—</span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={lead.source === 'maps' ? 'accent' : 'neutral'}>
                          {lead.source}
                        </Badge>
                      </Td>
                      <Td>
                        {team.length > 0 ? (
                          <Select
                            value={lead.ownerId ?? ''}
                            onChange={(e) => void updateOwner(lead.id, e.target.value)}
                            aria-label={`Owner for ${lead.businessName}`}
                            className="h-7 w-36 text-xs"
                          >
                            <option value="">{t('unassigned')}</option>
                            {team.map((member) => (
                              <option key={member.id} value={member.id}>
                                {ownerLabel(member)}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-xs muted">
                            {lead.owner ? ownerLabel(lead.owner) : '—'}
                          </span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs muted">
                        {relativeTime(lead.createdAt)}
                      </Td>
                      <Td>
                        <Select
                          value={lead.status}
                          onChange={(e) => void updateStatus(lead.id, e.target.value)}
                          aria-label={`Status for ${lead.businessName}`}
                          className="h-7 w-28 text-xs"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      </Td>
                      <Td align="right">
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          aria-label={`Delete ${lead.businessName}`}
                          onClick={() =>
                            setPendingDelete({ ids: [lead.id], label: lead.businessName })
                          }
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <Pagination page={page} pages={pages} total={total} onChange={setPage} label="leads" />
          </>
        ) : (
          <EmptyState
            icon={<Search strokeWidth={1.75} />}
            title={filtering ? 'No leads match that filter' : 'No leads yet'}
            description={
              filtering
                ? 'Try a different search or clear the filter.'
                : 'Gather a batch from Google Maps, or add one by hand.'
            }
            action={
              filtering ? (
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setStatus('');
                    setPage(1);
                  }}
                >{t('clearFilters')}</Button>
              ) : canGather ? (
                <Button variant="primary" size="sm" onClick={() => setGatherOpen(true)}>
                  <Sparkles className="h-4 w-4" strokeWidth={1.75} />{t('gatherLeads')}</Button>
              ) : undefined
            }
          />
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title={t('deleteLeads')}
        description={`${pendingDelete?.label ?? ''} will be removed from this workspace.`}
        confirmLabel={t('delete')}
        destructive
        loading={deleting}
      />

      <GatherModal
        open={gatherOpen}
        onClose={() => setGatherOpen(false)}
        onQueued={() => {
          setGatherOpen(false);
          toast.show('Lead search queued — results will appear here as they land.', 'success');
          void loadJobs();
          void load();
        }}
        onError={(m) => toast.show(m, 'alert')}
      />

      <ManualLeadModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onCreated={() => {
          setManualOpen(false);
          toast.show('Lead added.', 'success');
          void load();
        }}
        onError={(m) => toast.show(m, 'alert')}
      />

      {toast.node}
    </>
  );
}
