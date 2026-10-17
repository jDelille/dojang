import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Mail, Phone, Search, UserPlus } from 'lucide-react';
import { requireWorkspace } from '@/lib/session';
import { can } from '@/lib/rbac';
import { LeadsClient } from '@/components/leads/leads-client';
import { Card, CardHeader, EmptyState, Input, PageHeader, Table, Td, Th, Tr } from '@/components/ui';
import { odooConfigured } from '@/lib/odoo';
import { loadLeads, loadStages, type CrmLead, type CrmStage } from '@/lib/odoo-crm';
import { Chips, LinkPager, withParams } from '@/components/odoo/shared';
import { TrialStatus } from '@/components/odoo/trial-status';
import { relativeTime } from '@/lib/utils';

export const metadata = { title: 'Leads' };

const PATH = '/dashboard/leads';

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string; page?: string }> }) {
  const { user } = await requireWorkspace();
  // Without Odoo, fall back to Roster's own lead list.
  if (!odooConfigured()) return <LeadsClient canGather={can(user.role, 'leads:gather')} />;

  const t = await getTranslations('odoo');
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const stageId = Number(params.stage) || null;
  const page = Math.max(1, Number(params.page) || 1);

  let data: { leads: CrmLead[]; total: number; pages: number } | null = null;
  let stages: CrmStage[] = [];
  try {
    [data, stages] = await Promise.all([loadLeads({ q, stageId, page }), loadStages()]);
  } catch (error) {
    console.error('[leads] Odoo read failed:', error);
  }

  return (
    <>
      <PageHeader title={t('leads.title')} description={data ? t('leads.count', { count: data.total }) : undefined} />
      <Card>
        {!data ? (
          <EmptyState icon={<UserPlus strokeWidth={1.75} />} title={t('unavailableTitle')} description={t('unavailable')} />
        ) : (
          <>
            <CardHeader
              title={t('leads.all')}
              action={
                <form action={PATH} className="relative">
                  {stageId && <input type="hidden" name="stage" value={stageId} />}
                  <Search
                    className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 muted"
                    strokeWidth={1.75}
                  />
                  <Input name="q" defaultValue={q} placeholder={t('leads.search')} aria-label={t('leads.search')} className="h-8 w-56 ps-8 text-xs" />
                </form>
              }
            />
            <Chips
              label={t('leads.filterByStage')}
              items={[
                { key: 'all', label: t('all'), href: withParams(PATH, { q }), active: !stageId },
                ...stages.map((s) => ({ key: String(s.id), label: s.name, href: withParams(PATH, { q, stage: s.id }), active: s.id === stageId })),
              ]}
            />
            {data.leads.length ? (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('leads.contact')}</Th>
                      <Th>{t('leads.reach')}</Th>
                      <Th>{t('leads.stage')}</Th>
                      <Th>{t('leads.trial')}</Th>
                      <Th align="right">{t('leads.score')}</Th>
                      <Th>{t('leads.created')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leads.map((l) => (
                      <Tr key={l.id}>
                        <Td>
                          <Link href={`/dashboard/sales/leads/${l.id}`} className="font-medium hover:underline">
                            {l.contact}
                          </Link>
                          <p className="text-xs muted">{[l.name !== l.contact ? l.name : null, l.source].filter(Boolean).join(' · ')}</p>
                        </Td>
                        <Td>
                          <div className="space-y-0.5 text-xs">
                            {l.phone && (
                              <p className="flex items-center gap-1.5">
                                <Phone className="h-3 w-3 muted" strokeWidth={1.75} />
                                <span className="font-mono" dir="ltr">{l.phone}</span>
                              </p>
                            )}
                            {l.email && (
                              <p className="flex items-center gap-1.5">
                                <Mail className="h-3 w-3 muted" strokeWidth={1.75} />
                                <span className="truncate">{l.email}</span>
                              </p>
                            )}
                            {!l.phone && !l.email && <span className="muted">—</span>}
                          </div>
                        </Td>
                        <Td className="text-xs">{l.stage ?? '—'}</Td>
                        <Td>
                          <TrialStatus lead={l} t={t} />
                        </Td>
                        <Td align="right" className="text-xs tabular-nums">
                          {l.score}
                        </Td>
                        <Td className="whitespace-nowrap text-xs muted">{relativeTime(l.createdAt)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
                <LinkPager
                  page={page}
                  pages={data.pages}
                  summary={t('pageOf', { page, pages: data.pages, total: data.total })}
                  href={(p) => withParams(PATH, { q, stage: stageId, page: p })}
                  labels={{ previous: t('previous'), next: t('next'), nav: t('pagination') }}
                />
              </>
            ) : (
              <EmptyState
                icon={<UserPlus strokeWidth={1.75} />}
                title={q || stageId ? t('leads.noMatch') : t('leads.none')}
                description={q || stageId ? t('noMatchHint') : t('leads.noneHint')}
              />
            )}
          </>
        )}
      </Card>
    </>
  );
}
