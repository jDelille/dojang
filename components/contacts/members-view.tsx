'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Mail, Phone, Search, UserPlus, Users } from 'lucide-react';
import { buttonStyles, Card, CardHeader, EmptyState, Input, PageHeader, Table, Td, Th, Tr } from '@/components/ui';
import { Pagination } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import type { MemberRowSummary } from '@/lib/academy';

// Mirrors MEMBERSHIP_STATES in lib/academy (not imported, to keep the Odoo client out of the browser bundle).
const MEMBERSHIP_STATES = ['lead', 'trial', 'active', 'paused', 'cancelled'];

export type MembersData =
  | { ok: true; members: MemberRowSummary[]; total: number; pages: number }
  | { ok: false };

/**
 * Members, read from Odoo (dojo.member) — the academy's system of record.
 * Read-only: state, search and paging all live in the URL.
 */
export function MembersView({
  data,
  q,
  state,
  page,
}: {
  data: MembersData;
  q: string;
  state: string;
  page: number;
}) {
  const t = useTranslations('members');
  const ta = useTranslations('academy');
  const router = useRouter();

  const href = (next: { q?: string; state?: string; page?: number }) => {
    const params = new URLSearchParams();
    const merged = { q, state, page, ...next };
    if (merged.q) params.set('q', merged.q);
    if (merged.state) params.set('state', merged.state);
    if (merged.page && merged.page > 1) params.set('page', String(merged.page));
    const qs = params.toString();
    return `/dashboard/contacts${qs ? `?${qs}` : ''}`;
  };

  return (
    <>
      <PageHeader
        title={t('members')}
        description={data.ok ? t('count', { count: data.total }) : undefined}
        actions={
          <Link href="/dashboard/contacts/new" className={buttonStyles({ variant: 'primary', size: 'sm' })}>
            <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            {t('newStudent')}
          </Link>
        }
      />

      {!data.ok ? (
        <Card>
          <EmptyState icon={<Users strokeWidth={1.75} />} title={t('unavailableTitle')} description={ta('unavailable')} />
        </Card>
      ) : (
        <Card>
            <CardHeader
              title={t('allMembers')}
              action={
                <form action="/dashboard/contacts" className="relative">
                  {state && <input type="hidden" name="state" value={state} />}
                  <Search
                    className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 muted"
                    strokeWidth={1.75}
                  />
                  <Input
                    name="q"
                    defaultValue={q}
                    placeholder={t('search')}
                    aria-label={t('search')}
                    className="h-8 w-56 ps-8 text-xs"
                  />
                </form>
              }
            />

            <nav aria-label={t('filterByState')} className="flex flex-wrap gap-1.5 border-b border-[color:var(--color-border)] px-4 py-2.5">
              {['', ...MEMBERSHIP_STATES].map((s) => (
                <Link
                  key={s || 'all'}
                  href={href({ state: s, page: 1 })}
                  aria-current={s === state ? 'page' : undefined}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px]',
                    s === state
                      ? 'border-[color:var(--color-fg)] font-semibold'
                      : 'border-[color:var(--color-border)] muted',
                  )}
                >
                  {s ? ta(`state.${s}`) : t('all')}
                </Link>
              ))}
            </nav>

            {data.members.length ? (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('name')}</Th>
                      <Th>{t('reach')}</Th>
                      <Th>{t('rank')}</Th>
                      <Th>{t('status')}</Th>
                      <Th align="right">{t('attendance')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.map((m) => (
                      <Tr key={m.id}>
                        <Td>
                          <Link
                            href={`/dashboard/contacts/${m.id}`}
                            className="font-medium hover:text-[color:var(--color-accent-dark)] dark:hover:text-accent"
                          >
                            {m.name}
                          </Link>
                          <p className="text-xs muted">
                            {[m.memberNumber, m.minor ? (m.guardian ? ta('guardian', { name: m.guardian }) : ta('minorNoGuardian')) : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </Td>
                        <Td>
                          <div className="space-y-0.5 text-xs">
                            {m.phone && (
                              <p className="flex items-center gap-1.5">
                                <Phone className="h-3 w-3 muted" strokeWidth={1.75} />
                                <span className="font-mono" dir="ltr">{m.phone}</span>
                              </p>
                            )}
                            {m.email && (
                              <p className="flex items-center gap-1.5">
                                <Mail className="h-3 w-3 muted" strokeWidth={1.75} />
                                <span className="truncate">{m.email}</span>
                              </p>
                            )}
                            {!m.phone && !m.email && <span className="muted">—</span>}
                          </div>
                        </Td>
                        <Td className="text-xs">
                          {m.rank ? (
                            <>
                              {m.rank}
                              {m.stripes ? <span className="muted"> · {ta('stripes', { count: m.stripes })}</span> : null}
                            </>
                          ) : (
                            <span className="muted">{ta('noRank')}</span>
                          )}
                        </Td>
                        <Td>
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase',
                              m.membershipState === 'active' ? 'border-success/60 text-success' : 'border-[color:var(--color-border)] muted',
                            )}
                          >
                            {ta(`state.${m.membershipState}`)}
                          </span>
                        </Td>
                        <Td align="right" className="text-xs tabular-nums">
                          {Math.round(m.attendanceRate)}%
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>

                <Pagination
                  page={page}
                  pages={data.pages}
                  total={data.total}
                  label={t('label')}
                  onChange={(p) => router.push(href({ page: p }))}
                />
              </>
            ) : (
              <EmptyState
                icon={<Users strokeWidth={1.75} />}
                title={q || state ? t('noMatch') : t('none')}
                description={q || state ? t('noMatchHint') : t('noneHint')}
              />
            )}
          </Card>
      )}
    </>
  );
}
