'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  FileText,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Play,
  Search,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorBlock,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Table,
  Tabs,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { StatTile } from '@/components/charts';
import { formatDate, formatDuration, relativeTime } from '@/lib/utils';

type Call = {
  id: string;
  direction: 'in' | 'out';
  fromNumber: string;
  toNumber: string;
  durationSeconds: number;
  recordingUrl: string | null;
  transcript: string | null;
  summary: string | null;
  missed: boolean;
  textBackSent: boolean;
  status: string;
  createdAt: string;
  contact: { id: string; name: string } | null;
};

/** Call log — transcripts, AI summaries and missed-call text-back status. */
export function CallsClient({ initialMissedOnly }: { initialMissedOnly?: boolean }) {
  const t = useTranslations('calls');
  const [calls, setCalls] = useState<Call[]>([]);
  const [stats, setStats] = useState({ totalCalls: 0, totalMinutes: 0, missed: 0 });
  const [filter, setFilter] = useState(initialMissedOnly ? 'missed' : 'all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Call | null>(null);

  // Debounced so typing does not fire one request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [filter, debounced]);

  const load = useCallback(async () => {
    setError('');
    const controller = new AbortController();

    try {
      const params = new URLSearchParams({ limit: '25', page: String(page) });
      if (filter === 'missed') params.set('missed', '1');
      if (filter === 'inbound') params.set('direction', 'in');
      if (filter === 'outbound') params.set('direction', 'out');
      if (debounced) params.set('q', debounced);

      const res = await fetch(`/api/calls?${params}`, { signal: controller.signal });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Could not load calls.');
        return;
      }
      setCalls(data.calls ?? []);
      setStats(data.stats ?? { totalCalls: 0, totalMinutes: 0, missed: 0 });
      setPages(data.pages ?? 1);
      setTotal(data.total ?? 0);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }

    return () => controller.abort();
  }, [filter, debounced, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title={t('calls')}
        description={t('everyInboundAndOutboundCall')}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={t('calls')} value={stats.totalCalls} />
        <StatTile label={t('minutes')} value={stats.totalMinutes} />
        <StatTile label={t('missed')} value={stats.missed} tone={stats.missed ? 'accent' : 'neutral'} />
      </div>

      <Tabs
        label={t('callFilters')}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'missed', label: 'Missed' },
          { key: 'inbound', label: 'Inbound' },
          { key: 'outbound', label: 'Outbound' },
        ]}
        active={filter}
        onChange={setFilter}
      />

      <Card className="mt-4">
        <CardHeader
          title={t('callLog')}
          action={
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 muted"
                strokeWidth={1.75}
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t('searchCallsByNumberOr')}
                placeholder={t('searchNumberOrName')}
                className="h-8 w-56 ps-8 text-xs"
              />
            </div>
          }
        />

        {error ? (
          <ErrorBlock message={error} onRetry={() => void load()} />
        ) : loading ? (
          <LoadingBlock label={t('loadingCalls')} />
        ) : calls.length ? (
          <>
            <Table caption="Call log">
              <thead>
                <tr>
                  <Th>{t('direction')}</Th>
                  <Th>{t('contact')}</Th>
                  <Th>{t('number')}</Th>
                  <Th align="right">{t('duration')}</Th>
                  <Th>{t('outcome')}</Th>
                  <Th>{t('when')}</Th>
                  <Th align="right">{t('detail')}</Th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <Tr key={call.id}>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {call.missed ? (
                          <PhoneMissed className="h-3.5 w-3.5 text-alert" strokeWidth={1.75} />
                        ) : call.direction === 'in' ? (
                          <PhoneIncoming className="h-3.5 w-3.5 muted" strokeWidth={1.75} />
                        ) : (
                          <PhoneOutgoing className="h-3.5 w-3.5 muted" strokeWidth={1.75} />
                        )}
                        {call.direction === 'in' ? 'Inbound' : 'Outbound'}
                      </span>
                    </Td>
                    <Td>
                      {call.contact ? (
                        <Link
                          href={`/dashboard/contacts/${call.contact.id}`}
                          className="text-sm hover:text-[color:var(--color-accent-dark)] dark:hover:text-accent"
                        >
                          {call.contact.name}
                        </Link>
                      ) : (
                        <span className="text-xs muted">{t('unknownCaller')}</span>
                      )}
                    </Td>
                    <Td className="font-mono text-xs">
                      {call.direction === 'in' ? call.fromNumber : call.toNumber}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatDuration(call.durationSeconds)}
                    </Td>
                    <Td>
                      {call.missed ? (
                        <span className="flex flex-wrap items-center gap-1">
                          <Badge tone="alert">missed</Badge>
                          {call.textBackSent && <Badge tone="success">texted back</Badge>}
                        </span>
                      ) : (
                        <Badge>{call.status}</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs muted">
                      {relativeTime(call.createdAt)}
                    </Td>
                    <Td align="right">
                      {call.transcript || call.summary || call.recordingUrl ? (
                        <button
                          type="button"
                          onClick={() => setOpen(call)}
                          aria-label={`Open details for the call with ${call.contact?.name ?? call.fromNumber}`}
                          className="rounded-control p-1.5 muted transition-colors hover:text-[color:var(--color-fg)]"
                        >
                          <FileText className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      ) : (
                        <span className="text-xs muted">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>

            <Pagination page={page} pages={pages} total={total} onChange={setPage} label="calls" />
          </>
        ) : (
          <EmptyState
            icon={<PhoneIncoming strokeWidth={1.75} />}
            title={filter === 'missed' ? 'No missed calls' : 'No calls yet'}
            description="Point your Twilio number's voice webhook at this install and calls will appear here with a transcript and summary."
          />
        )}
      </Card>

      <Modal
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open ? `Call with ${open.contact?.name ?? open.fromNumber}` : 'Call'}
        description={open ? `${formatDate(open.createdAt, true)} · ${formatDuration(open.durationSeconds)}` : undefined}
      >
        {open && (
          <div className="space-y-5">
            {open.summary && (
              <div>
                <p className="label-caps mb-2">{t('aiSummary')}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{open.summary}</p>
              </div>
            )}

            {open.recordingUrl && (
              <div>
                <p className="label-caps mb-2">{t('recording')}</p>
                <a
                  href={open.recordingUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
                >
                  <Play className="h-3.5 w-3.5" strokeWidth={1.75} />{t('openRecording')}</a>
              </div>
            )}

            {open.transcript ? (
              <div>
                <p className="label-caps mb-2">{t('transcript')}</p>
                <pre className="scrollbar-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-control border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 font-mono text-xs leading-relaxed">
                  {open.transcript}
                </pre>
              </div>
            ) : (
              <p className="text-xs muted">{t('noTranscriptWasCapturedFor')}</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
