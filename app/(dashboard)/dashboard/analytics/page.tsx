import { requireWorkspace } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import {
  getAnalyticsSummary,
  getLeadTimeseries,
  getRetentionPerformance,
} from '@/lib/analytics';
import { getUsageTimeseries } from '@/lib/usage';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th, Tr } from '@/components/ui';
import { BarChart, FunnelChart, LineChart, StatTile } from '@/components/charts';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { Repeat } from 'lucide-react';
import { RangePicker } from '@/components/analytics/range-picker';
import { grainLabel, parseRange, rangeLabel } from '@/lib/ranges';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics' };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const t = await getTranslations('analyticsPage');
  const { workspace, workspaceId } = await requireWorkspace();
  const { range } = await searchParams;
  const days = parseRange(range);
  const period = rangeLabel(days);
  // Mirrors the bucketing in getLeadTimeseries so the caption never claims
  // a granularity the line does not have.
  const grain = grainLabel(days);

  const [summary, timeseries, retention, smsUsage, aiUsage] = await Promise.all([
    getAnalyticsSummary(workspaceId, days),
    getLeadTimeseries(workspaceId, days),
    getRetentionPerformance(workspaceId),
    getUsageTimeseries(workspaceId, 'sms_sent', days),
    getUsageTimeseries(workspaceId, 'ai_tokens_out', days),
  ]);

  const sourceData = Object.entries(summary.leads.bySource).map(([label, value]) => ({
    label,
    value,
  }));

  return (
    <>
      <PageHeader
        title={t('analytics')}
        description={`${period}, compared with the ${days} days before.`}
        actions={<RangePicker active={days} />}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t('leadsGathered')} value={summary.leads.total} delta={summary.leads.delta} />
        <StatTile
          label={t('conversionRate')}
          value={`${summary.leads.conversionRate.toFixed(1)}%`}
          hint={`${summary.leads.converted} won`}
        />
        <StatTile
          label={t('revenueAttributed')}
          value={formatCurrency(summary.revenue.total, workspace.currency)}
          delta={summary.revenue.delta}
          tone="accent"
        />
        <StatTile
          label={t('medianResponseTime')}
          value={
            summary.engagement.responseTimeMinutes
              ? `${summary.engagement.responseTimeMinutes}m`
              : '—'
          }
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LineChart
            title={t('leadsAndConversions')}
            description={`${grain} · ${period}`}
            series={[
              { label: 'Gathered', points: timeseries.map((p) => ({ x: p.x, y: p.gathered })) },
              { label: 'Converted', points: timeseries.map((p) => ({ x: p.x, y: p.converted })) },
            ]}
          />
        </div>
        <FunnelChart title={t('funnel')} description={t('stageToStage')} stages={summary.leads.funnel} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChart
          title={t('whereLeadsComeFrom')}
          description={period}
          data={sourceData.length ? sourceData : [{ label: 'No leads yet', value: 0 }]}
          valueLabel="Leads"
          colorBy="category"
        />
        <LineChart
          title={t('outboundVolume')}
          description={`SMS sent per day · ${period}`}
          series={[{ label: 'SMS', points: smsUsage.map((p) => ({ x: p.day, y: p.value })) }]}
          height={200}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t('retentionCampaignPerformance')}
            description={t('enrolledVsCompletedPerRule')}
          />
          {retention.length ? (
            /* Five short columns in a half-width card — the default 640px
               floor clipped the rate column off the right edge. */
            <Table minWidth={460}>
              <thead>
                <tr>
                  <Th>{t('rule')}</Th>
                  <Th align="right">{t('enrolled')}</Th>
                  <Th align="right">{t('completed')}</Th>
                  <Th align="right">{t('failed')}</Th>
                  <Th align="right">{t('rate')}</Th>
                </tr>
              </thead>
              <tbody>
                {retention.map((rule) => (
                  <Tr key={rule.id}>
                    <Td>
                      <span className="text-sm">{rule.name}</span>
                      {!rule.isActive && <span className="ms-2 text-xs muted">paused</span>}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(rule.enrolled)}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(rule.completed)}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {rule.failed ? <span className="text-alert">{rule.failed}</span> : '0'}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {rule.completionRate.toFixed(0)}%
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              icon={<Repeat strokeWidth={1.75} />}
              title={t('noRetentionRulesYet')}
              description={t('createOneToSeeIts')}
            />
          )}
        </Card>

        <Card>
          <CardHeader title={t('usage')} description={t('meteredForBillingAndQuota')} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ['AI tokens in', summary.usage.ai_tokens_in],
                ['AI tokens out', summary.usage.ai_tokens_out],
                ['SMS sent', summary.usage.sms_sent],
                ['Emails sent', summary.usage.emails_sent],
                ['Call minutes', summary.usage.calls_minutes],
                ['Push sent', summary.usage.push_sent],
                ['Leads gathered', summary.usage.leads_gathered],
                ['Appointments', summary.engagement.appointments],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs muted">{label}</dt>
                  <dd className="font-display text-lg font-semibold tabular-nums">
                    {formatNumber(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>
            {aiUsage.some((p) => p.value > 0) && (
              <p className="mt-4 border-t border-[color:var(--color-border)] pt-3 text-xs muted">
                Peak AI output in a single day:{' '}
                {formatNumber(Math.max(...aiUsage.map((p) => p.value)))} tokens.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
