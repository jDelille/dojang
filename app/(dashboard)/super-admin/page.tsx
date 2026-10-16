import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  ServerCog,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { activeDemoFlags } from '@/lib/demo-mode';
import { SitePages } from '@/components/super-admin/site-pages';
import { can } from '@/lib/rbac';
import { getUsageByWorkspace } from '@/lib/usage';
import { checkDatabase, checkRedis, getInstallState } from '@/lib/install';
import { queueHealth } from '@/lib/queue';
import { currentDomain } from '@/lib/integrations/envato';
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
import { BarChart, StatTile } from '@/components/charts';
import { CreateWorkspace } from '@/components/super-admin/create-workspace';
import { daysAgo, formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Super Admin' };

const LICENSE_TONE: Record<string, 'success' | 'alert' | 'warning' | 'neutral'> = {
  active: 'success',
  invalid: 'alert',
  domain_mismatch: 'alert',
  unverified: 'warning',
};

export default async function SuperAdminPage() {
  const t = await getTranslations('superAdminPage');
  const demoFlags = activeDemoFlags();
  const user = await requireUser();
  if (!can(user.role, 'platform:admin')) redirect('/dashboard');

  const tenancyMode = process.env.ROSTER_TENANCY_MODE ?? 'single';
  const since = daysAgo(30);

  const [
    workspaces,
    usage,
    totalUsers,
    totalLeads,
    totalContacts,
    totalConversations,
    newLeads30d,
    activeAgents,
    failedRuns,
    stalledJobs,
    db,
    redis,
    queues,
    install,
  ] = await Promise.all([
    prisma.workspace.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        license: { select: { status: true, domain: true, buyerName: true } },
        parent: { select: { id: true, name: true } },
        _count: { select: { users: true, leads: true, contacts: true, conversations: true } },
      },
    }),
    getUsageByWorkspace(30),
    prisma.user.count(),
    prisma.lead.count(),
    prisma.contact.count(),
    prisma.conversation.count(),
    prisma.lead.count({ where: { createdAt: { gte: since } } }),
    prisma.aiAgent.count({ where: { isActive: true } }),
    prisma.retentionRun.count({ where: { status: 'failed' } }),
    prisma.leadGatherJob.count({ where: { status: { in: ['queued', 'running'] } } }),
    checkDatabase(),
    checkRedis(),
    queueHealth().catch(() => ({}) as Record<string, unknown>),
    getInstallState(),
  ]);

  const totalTokens = [...usage.values()].reduce(
    (sum, u) => sum + u.ai_tokens_in + u.ai_tokens_out,
    0,
  );
  const totalSms = [...usage.values()].reduce((sum, u) => sum + u.sms_sent, 0);

  // Rank tenants by AI spend — the number an agency actually bills on.
  const byTokens = workspaces
    .map((w) => {
      const u = usage.get(w.id);
      return { label: w.name, value: (u?.ai_tokens_in ?? 0) + (u?.ai_tokens_out ?? 0) };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const unlicensed = workspaces.filter(
    (w) => !w.license || w.license.status !== 'active',
  ).length;

  return (
    <>
      <PageHeader
        title={t('superAdmin')}
        description={`Platform console · ${tenancyMode === 'multi' ? 'multi-tenant (agency) mode' : 'single-workspace mode'} · ${currentDomain()}`}
        actions={tenancyMode === 'multi' ? <CreateWorkspace /> : undefined}
      />

      {/* ── Platform health ─────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader
          title={t('systemHealth')}
          description={t('ifAnyOfTheseAre')}
        />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HealthTile
            icon={<Database className="h-4 w-4" strokeWidth={1.75} />}
            label={t('postgresql')}
            ok={db.ok}
            detail={db.ok ? 'Connected' : db.message}
          />
          <HealthTile
            icon={<ServerCog className="h-4 w-4" strokeWidth={1.75} />}
            label={t('redis')}
            ok={redis.ok}
            detail={redis.ok ? 'Connected' : redis.message}
          />
          <HealthTile
            icon={<Activity className="h-4 w-4" strokeWidth={1.75} />}
            label={t('jobQueues')}
            ok={Object.keys(queues).length > 0 && redis.ok}
            detail={
              redis.ok
                ? `${Object.keys(queues).length} queues registered`
                : 'Unavailable without Redis'
            }
          />
          <HealthTile
            icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.75} />}
            label={t('install')}
            ok={install.completed}
            detail={
              install.completed
                ? `v${install.version}${install.completedAt ? ` · ${formatDate(install.completedAt)}` : ''}`
                : 'Installer has not been completed'
            }
          />
        </CardBody>

        {Object.keys(queues).length > 0 && (
          <div className="border-t border-[color:var(--color-border)] px-5 py-3">
            <Table caption="Background queue depth">
              <thead>
                <tr>
                  <Th>{t('queue')}</Th>
                  <Th align="right">{t('waiting')}</Th>
                  <Th align="right">{t('active')}</Th>
                  <Th align="right">{t('delayed')}</Th>
                  <Th align="right">{t('failed')}</Th>
                  <Th align="right">{t('completed')}</Th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(queues).map(([name, counts]) => {
                  const c = counts as Record<string, number> & { error?: string };
                  return (
                    <Tr key={name}>
                      <Td className="font-mono text-xs">{name.replace('roster-', '')}</Td>
                      {c.error ? (
                        <Td align="right" className="text-xs text-alert">
                          {c.error}
                        </Td>
                      ) : (
                        <>
                          <Td align="right" className="tabular-nums">{c.waiting ?? 0}</Td>
                          <Td align="right" className="tabular-nums">{c.active ?? 0}</Td>
                          <Td align="right" className="tabular-nums">{c.delayed ?? 0}</Td>
                          <Td align="right" className="tabular-nums">
                            {c.failed ? <span className="text-alert">{c.failed}</span> : 0}
                          </Td>
                          <Td align="right" className="tabular-nums muted">{c.completed ?? 0}</Td>
                        </>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {/* ── Platform totals ─────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t('workspaces')} value={workspaces.length} tone="accent" />
        <StatTile label={t('users')} value={totalUsers} />
        <StatTile label={t('leads')} value={totalLeads} hint={`${formatNumber(newLeads30d)} in last 30d`} />
        <StatTile label={t('conversations')} value={totalConversations} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t('aiTokens30d')} value={totalTokens} />
        <StatTile label={t('smsSent30d')} value={totalSms} />
        <StatTile label={t('activeAiAgents')} value={activeAgents} />
        <StatTile
          label={t('contacts')}
          value={totalContacts}
          hint={`${workspaces.length ? Math.round(totalContacts / workspaces.length) : 0} avg per workspace`}
        />
      </div>

      {(demoFlags.length > 0 || failedRuns > 0 || stalledJobs > 0 || unlicensed > 0) && (
        <Card className="mb-4 border-warning/40">
          <CardHeader title={t('needsAttention')} />
          <CardBody className="space-y-2 text-sm">
            {/* First, because everything below is meaningless if the install
                is only pretending to send and settle. */}
            {demoFlags.map((flag) => (
              <AttentionRow key={flag.key} text={flag.label} hint={flag.hint} />
            ))}
            {failedRuns > 0 && (
              <AttentionRow
                text={`${failedRuns} retention run${failedRuns === 1 ? '' : 's'} failed`}
                hint={t('usuallyAMissingSmtpOr')}
              />
            )}
            {stalledJobs > 0 && (
              <AttentionRow
                text={`${stalledJobs} lead-gathering job${stalledJobs === 1 ? '' : 's'} still queued`}
                hint={t('ifThisDoesNotClear')}
              />
            )}
            {unlicensed > 0 && (
              <AttentionRow
                text={`${unlicensed} workspace${unlicensed === 1 ? '' : 's'} without an active license`}
                hint={t('fineOnLocalhostVerifyThe')}
              />
            )}
          </CardBody>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChart
          title={t('aiUsageByWorkspace')}
          description={t('totalTokensLast30Days')}
          data={byTokens.length ? byTokens : [{ label: 'No usage yet', value: 0 }]}
          valueLabel="Tokens"
          colorBy="category"
        />

        <Card>
          <CardHeader
            title={t('tenancy')}
            description={
              tenancyMode === 'multi'
                ? 'Agencies can create and bill their own sub-accounts.'
                : 'Single-workspace mode — the agency layer is switched off.'
            }
          />
          <CardBody className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="muted">{t('mode')}</span>
              <Badge tone={tenancyMode === 'multi' ? 'accent' : 'neutral'}>{tenancyMode}</Badge>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="muted">{t('subAccounts')}</span>
              <span className="tabular-nums">{workspaces.filter((w) => w.parentId).length}</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="muted">{t('licensed')}</span>
              <span className="tabular-nums">
                {workspaces.length - unlicensed} / {workspaces.length}
              </span>
            </div>
            {tenancyMode !== 'multi' && (
              <p className="rounded-control border border-[color:var(--color-border)] p-3 text-xs muted">
                Set <code className="font-mono">{t('rosterTenancyModeMulti')}</code> in your .env and
                restart to enable agency mode, sub-accounts and per-tenant billing.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Workspace table ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title={t('allWorkspaces')}
          description={t('usageCoversTheLast30')}
        />
        {workspaces.length ? (
          <Table caption="All workspaces on this install">
            <thead>
              <tr>
                <Th>{t('workspace')}</Th>
                <Th>{t('agency')}</Th>
                <Th align="right">{t('users')}</Th>
                <Th align="right">{t('leads')}</Th>
                <Th align="right">{t('aiTokens')}</Th>
                <Th align="right">SMS</Th>
                <Th align="right">{t('callMin')}</Th>
                <Th>{t('license')}</Th>
                <Th>{t('created')}</Th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((workspace) => {
                const u = usage.get(workspace.id);
                const aiTokens = (u?.ai_tokens_in ?? 0) + (u?.ai_tokens_out ?? 0);

                return (
                  <Tr key={workspace.id}>
                    <Td>
                      <Link
                        href={`/super-admin/${workspace.id}`}
                        className="text-sm font-medium hover:text-[color:var(--color-accent-dark)] dark:hover:text-accent"
                      >
                        {workspace.name}
                      </Link>
                      <p className="font-mono text-xs muted">{workspace.slug}</p>
                    </Td>
                    <Td className="text-xs muted">{workspace.parent?.name ?? '—'}</Td>
                    <Td align="right" className="tabular-nums">{workspace._count.users}</Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(workspace._count.leads)}
                    </Td>
                    <Td align="right" className="tabular-nums">{formatNumber(aiTokens)}</Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(u?.sms_sent ?? 0)}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(u?.calls_minutes ?? 0)}
                    </Td>
                    <Td>
                      {workspace.license ? (
                        <>
                          <Badge tone={LICENSE_TONE[workspace.license.status] ?? 'neutral'}>
                            {workspace.license.status.replace('_', ' ')}
                          </Badge>
                          <p className="mt-1 font-mono text-[11px] muted">
                            {workspace.license.domain}
                          </p>
                        </>
                      ) : (
                        <Badge>none</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs muted">
                      {formatDate(workspace.createdAt)}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Building2 strokeWidth={1.75} />} title={t('noWorkspaces')} />
        )}
      </Card>

      <div className="mt-4">
        <SitePages />
      </div>
    </>
  );
}

function HealthTile({
  icon,
  label,
  ok,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div
      className={`rounded-control border p-3 ${ok ? 'border-[color:var(--color-border)]' : 'border-alert/40'}`}
    >
      <div className="flex items-center gap-2">
        <span className="muted">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
        {ok ? (
          <CheckCircle2 className="ms-auto h-4 w-4 text-success" strokeWidth={1.75} />
        ) : (
          <XCircle className="ms-auto h-4 w-4 text-alert" strokeWidth={1.75} />
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs muted">{detail}</p>
    </div>
  );
}

function AttentionRow({ text, hint }: { text: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.75} />
      <div>
        <p>{text}</p>
        <p className="text-xs muted">{hint}</p>
      </div>
    </div>
  );
}
