import { getTranslations } from 'next-intl/server';
import { KanbanSquare } from 'lucide-react';
import { requireWorkspace } from '@/lib/session';
import { PipelineBoard } from '@/components/pipeline/kanban';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { odooConfigured } from '@/lib/odoo';
import { loadBoard, type CrmLead, type CrmStage } from '@/lib/odoo-crm';
import { TrialStatus } from '@/components/odoo/trial-status';
import { cn, relativeTime } from '@/lib/utils';

export const metadata = { title: 'Pipeline' };

/** The trial pipeline as Odoo CRM stages. Read-only — moves happen in Odoo. */
export default async function PipelinePage() {
  await requireWorkspace();
  // Without Odoo, fall back to Roster's own deal board.
  if (!odooConfigured()) return <PipelineBoard />;

  const t = await getTranslations('odoo');
  let board: { stages: CrmStage[]; leads: CrmLead[] } | null = null;
  try {
    board = await loadBoard();
  } catch (error) {
    console.error('[pipeline] Odoo read failed:', error);
  }

  if (!board) {
    return (
      <>
        <PageHeader title={t('pipeline.title')} />
        <Card>
          <EmptyState icon={<KanbanSquare strokeWidth={1.75} />} title={t('unavailableTitle')} description={t('unavailable')} />
        </Card>
      </>
    );
  }

  const byStage = new Map<number, CrmLead[]>();
  for (const lead of board.leads) {
    if (lead.stageId) byStage.set(lead.stageId, [...(byStage.get(lead.stageId) ?? []), lead]);
  }
  // Odoo keeps a stock stage set alongside the academy's; an empty stage whose
  // name repeats another's is noise.
  // Keep a stage if it has leads; otherwise only one stage per name, and none
  // when a same-named stage already has leads.
  const withLeads = new Set(board.stages.filter((s) => byStage.has(s.id)).map((s) => s.name));
  const shown = new Set<string>();
  const stages = board.stages.filter((s) => {
    if (byStage.has(s.id)) return true;
    if (withLeads.has(s.name) || shown.has(s.name)) return false;
    shown.add(s.name);
    return true;
  });

  return (
    <>
      <PageHeader title={t('pipeline.title')} description={t('pipeline.description', { count: board.leads.length })} />
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {stages.map((stage) => {
          const leads = byStage.get(stage.id) ?? [];
          return (
            <section
              key={stage.id}
              aria-label={stage.name}
              className="w-64 shrink-0 rounded-card border border-[color:var(--color-border)] bg-inset p-2"
            >
              <h2 className="flex items-baseline justify-between px-1.5 pb-2 pt-1 text-[12px] font-semibold">
                <span className={cn(stage.won && 'text-success')}>{stage.name}</span>
                <span className="font-mono text-[11px] muted">{leads.length}</span>
              </h2>
              <ul className="space-y-2">
                {leads.map((l) => (
                  <li key={l.id} className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-3">
                    <p className="truncate text-[13px] font-medium">{l.contact}</p>
                    {l.name !== l.contact && <p className="truncate text-[11px] muted">{l.name}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <TrialStatus lead={l} t={t} />
                      <span className="text-[11px] muted">{relativeTime(l.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] muted">{t('pipeline.readOnly')}</p>
    </>
  );
}
