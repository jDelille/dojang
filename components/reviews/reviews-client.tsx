'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw, Sparkles, Star } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Tabs,
  Textarea,
  useToast,
} from '@/components/ui';
import { StatTile } from '@/components/charts';
import { formatDate } from '@/lib/utils';

type Review = {
  id: string;
  source: string;
  authorName: string | null;
  rating: number;
  body: string;
  aiResponseDraft: string | null;
  publishedReply: string | null;
  status: string;
  createdAt: string;
};

/** Reputation management (spec §4.6): monitor, AI-draft, approve, mark posted. */
export function ReviewsClient() {
  const t = useTranslations('reviews');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [average, setAverage] = useState(0);
  const [total, setTotal] = useState(0);
  const [awaiting, setAwaiting] = useState(0);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const toast = useToast();

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' });
    if (filter) params.set('status', filter);

    const res = await fetch(`/api/reviews?${params}`);
    const data = await res.json();
    if (res.ok) {
      setReviews(data.reviews ?? []);
      setAverage(data.averageRating ?? 0);
      setTotal(data.totalReviews ?? 0);
      setAwaiting(data.awaitingReply ?? 0);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/reviews/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return toast.show(data.error ?? 'Could not pull reviews.', 'alert');
      toast.show(
        data.imported
          ? `Imported ${data.imported} new review${data.imported === 1 ? '' : 's'}.`
          : 'No new reviews found.',
        'success',
      );
      void load();
    } finally {
      setSyncing(false);
    }
  };

  const draft = async (review: Review) => {
    setDrafting(review.id);
    try {
      const res = await fetch(`/api/reviews/${review.id}?action=draft`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return toast.show(data.error ?? 'Could not draft a reply.', 'alert');
      setDrafts((prev) => ({ ...prev, [review.id]: data.review.aiResponseDraft ?? '' }));
      void load();
    } finally {
      setDrafting(null);
    }
  };

  const markResponded = async (review: Review) => {
    const reply = drafts[review.id] ?? review.aiResponseDraft ?? '';
    if (!reply.trim()) return toast.show('Write or draft a reply first.', 'alert');

    const res = await fetch(`/api/reviews/${review.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishedReply: reply, status: 'responded' }),
    });
    if (!res.ok) return toast.show('Could not save that.', 'alert');
    toast.show('Marked as responded.', 'success');
    void load();
  };

  return (
    <>
      <PageHeader
        title={t('reviews')}
        description={t('monitorWhatCustomersSayAnd')}
        actions={
          <Button variant="primary" size="sm" loading={syncing} onClick={() => void sync()}>
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} />{t('pullFromGoogle')}</Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={t('averageRating')} value={average ? average.toFixed(2) : '—'} tone="accent" />
        <StatTile label={t('reviewsTracked')} value={total} />
        <StatTile label={t('awaitingAReply')} value={awaiting} tone={awaiting > 0 ? 'warning' : undefined} />
      </div>

      <Tabs
        tabs={[
          { key: '', label: 'All' },
          { key: 'new', label: 'New' },
          { key: 'drafted', label: 'Drafted' },
          { key: 'responded', label: 'Responded' },
        ]}
        active={filter}
        onChange={setFilter}
      />

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin muted" strokeWidth={1.75} />
          </div>
        ) : reviews.length ? (
          reviews.map((review) => (
            <Card key={review.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex gap-0.5" aria-label={`${review.rating} out of 5`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={
                              n <= review.rating ? 'h-3.5 w-3.5 text-warning' : 'h-3.5 w-3.5 muted'
                            }
                            strokeWidth={1.75}
                            fill={n <= review.rating ? 'currentColor' : 'none'}
                          />
                        ))}
                      </span>
                      <span className="text-sm font-medium">{review.authorName ?? 'Anonymous'}</span>
                      <Badge>{review.source}</Badge>
                      <Badge
                        tone={
                          review.status === 'responded'
                            ? 'success'
                            : review.status === 'drafted'
                              ? 'accent'
                              : 'neutral'
                        }
                      >
                        {review.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs muted">{formatDate(review.createdAt)}</p>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm">{review.body}</p>

                {review.status !== 'responded' && (
                  <div className="mt-4 border-t border-[color:var(--color-border)] pt-4">
                    <Textarea
                      value={drafts[review.id] ?? review.aiResponseDraft ?? ''}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [review.id]: e.target.value }))
                      }
                      placeholder={t('yourPublicReply')}
                      className="min-h-[80px]"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={drafting === review.id}
                        onClick={() => void draft(review)}
                      >
                        <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                        {review.aiResponseDraft ? 'Redraft with AI' : 'Draft with AI'}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void markResponded(review)}
                      >{t('markAsPosted')}</Button>
                      <p className="self-center text-xs muted">{t('copyTheReplyIntoGoogle')}</p>
                    </div>
                  </div>
                )}

                {review.publishedReply && (
                  <div className="mt-4 rounded-control border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                    <p className="label-caps mb-1">{t('yourReply')}</p>
                    <p className="whitespace-pre-wrap text-sm">{review.publishedReply}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          ))
        ) : (
          <Card>
            <EmptyState
              icon={<Star strokeWidth={1.75} />}
              title={t('noReviewsYet')}
              description={t('pullYourGoogleReviewsOr')}
              action={
                <Button variant="primary" size="sm" loading={syncing} onClick={() => void sync()}>{t('pullFromGoogle')}</Button>
              }
            />
          </Card>
        )}
      </div>

      {toast.node}
    </>
  );
}
