import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowLeft, Bot, Users } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { can, ROLE_LABELS } from '@/lib/rbac';
import { getUsageSummary, getUsageTimeseries } from '@/lib/usage';
import { listIntegrationStatus } from '@/lib/credentials';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { LineChart, StatTile } from '@/components/charts';
import { formatDate, formatNumber, relativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });
  return { title: workspace?.name ?? 'Workspace' };
}

export default async function SuperAdminWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations('superAdminPage');
  const user = await requireUser();
  if (!can(user.role, 'platform:admin')) redirect('/dashboard');

  const { id } = await params;

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      license: true,
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true, slug: true } },
      users: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
        },
      },
      agents: {
        select: { id: true, name: true, provider: true, model: true, isActive: true },
      },
      _count: {
        select: {
          leads: true,
          contacts: true,
          deals: true,
          conversations: true,
          invoices: true,
          appointments: true,
          retentionRules: true,
        },
      },
    },
  });

  if (!workspace) notFound();

  const [usage, tokenSeries, smsSeries, integrations] = await Promise.all([
    getUsageSummary(workspace.id, 30),
    getUsageTimeseries(workspace.id, 'ai_tokens_out', 30),
    getUsageTimeseries(workspace.id, 'sms_sent', 30),
    listIntegrationStatus(workspace.id),
  ]);

  const configured = integrations.filter((i) => i.configured);

  return (
    <>
      <Link
        href="/super-admin"
        className="mb-4 inline-flex items-center gap-1.5 text-xs muted transition-colors hover:text-[color:var(--color-fg)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />{t('allWorkspaces')}</Link>

      <PageHeader
        title={workspace.name}
        description={`${workspace.slug} · created ${formatDate(workspace.createdAt)}${
          workspace.parent ? ` · sub-account of ${workspace.parent.name}` : ''
        }`}
        actions={
          workspace.license ? (
            <Badge
              tone={
                workspace.license.status === 'active'
                  ? 'success'
                  : workspace.license.status === 'unverified'
                    ? 'warning'
                    : 'alert'
              }
            >
              License: {workspace.license.status.replace('_', ' ')}
            </Badge>
          ) : (
            <Badge>{t('noLicense')}</Badge>
          )
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t('leads')} value={workspace._count.leads} />
        <StatTile label={t('contacts')} value={workspace._count.contacts} />
        <StatTile
          label={t('aiTokens30d')}
          value={usage.ai_tokens_in + usage.ai_tokens_out}
          tone="accent"
        />
        <StatTile label={t('sms30d')} value={usage.sms_sent} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LineChart
          title={t('aiOutputTokens')}
          description={t('dailyLast30Days')}
          series={[
            { label: 'Tokens out', points: tokenSeries.map((p) => ({ x: p.day, y: p.value })) },
          ]}
          height={200}
        />
        <LineChart
          title={t('smsSent')}
          description={t('dailyLast30Days')}
          series={[{ label: 'SMS', points: smsSeries.map((p) => ({ x: p.day, y: p.value })) }]}
          height={200}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('team')} description={`${workspace.users.length} member(s)`} />
          {workspace.users.length ? (
            <Table caption="Workspace team members">
              <thead>
                <tr>
                  <Th>{t('name')}</Th>
                  <Th>{t('role')}</Th>
                  <Th>{t('lastSignIn')}</Th>
                </tr>
              </thead>
              <tbody>
                {workspace.users.map((member) => (
                  <Tr key={member.id}>
                    <Td>
                      <p className="text-sm">{member.name ?? '—'}</p>
                      <p className="font-mono text-xs muted">{member.email}</p>
                    </Td>
                    <Td>
                      <Badge tone={member.isActive ? 'neutral' : 'alert'}>
                        {ROLE_LABELS[member.role]}
                      </Badge>
                    </Td>
                    <Td className="text-xs muted">
                      {member.lastLoginAt ? relativeTime(member.lastLoginAt) : 'never'}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Users strokeWidth={1.75} />} title={t('noUsers')} />
          )}
        </Card>

        <Card>
          <CardHeader
            title={t('aiAgents')}
            description={`${workspace.agents.filter((a) => a.isActive).length} live`}
          />
          {workspace.agents.length ? (
            <ul className="divide-y divide-[color:var(--color-border)]">
              {workspace.agents.map((agent) => (
                <li key={agent.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{agent.name}</p>
                    <p className="font-mono text-xs muted">
                      {agent.provider} · {agent.model}
                    </p>
                  </div>
                  <Badge tone={agent.isActive ? 'success' : 'neutral'}>
                    {agent.isActive ? 'Live' : 'Paused'}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Bot strokeWidth={1.75} />} title={t('noAgentsConfigured')} />
          )}
        </Card>

        <Card>
          <CardHeader title={t('activity')} description={t('allTime')} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              {[
                ['Deals', workspace._count.deals],
                ['Conversations', workspace._count.conversations],
                ['Appointments', workspace._count.appointments],
                ['Invoices', workspace._count.invoices],
                ['Retention rules', workspace._count.retentionRules],
                ['Emails (30d)', usage.emails_sent],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs muted">{label}</dt>
                  <dd className="font-display text-lg font-semibold tabular-nums">
                    {formatNumber(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t('integrations')}
            description={`${configured.length} of ${integrations.length} configured`}
          />
          <CardBody className="flex flex-wrap gap-1.5">
            {integrations.map((integration) => (
              <Badge
                key={integration.provider}
                tone={integration.configured ? 'success' : 'neutral'}
              >
                {integration.provider}
              </Badge>
            ))}
          </CardBody>
          {workspace.license && (
            <div className="border-t border-[color:var(--color-border)] px-5 py-4 text-xs">
              <p className="label-caps mb-2">{t('license')}</p>
              <div className="space-y-1.5">
                <Row label={t('domain')} value={workspace.license.domain} />
                {workspace.license.buyerName && (
                  <Row label={t('buyer')} value={workspace.license.buyerName} />
                )}
                {workspace.license.verifiedAt && (
                  <Row label={t('verified')} value={formatDate(workspace.license.verifiedAt)} />
                )}
                {workspace.license.message && (
                  <p className="pt-1 muted">{workspace.license.message}</p>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {workspace.children.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title={t('subAccounts')}
            description={`${workspace.children.length} workspace(s) under this agency`}
          />
          <ul className="divide-y divide-[color:var(--color-border)]">
            {workspace.children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/super-admin/${child.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                >
                  <span className="text-sm">{child.name}</span>
                  <span className="font-mono text-xs muted">{child.slug}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="muted">{label}</span>
      <span className="text-end font-mono">{value}</span>
    </div>
  );
}
