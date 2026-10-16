import { fromOdooDatetime, m2oName, searchCount, searchRead, type Many2one } from '@/lib/odoo';

/**
 * Trial pipeline from Odoo CRM (crm.lead, extended by dojo_crm with trial
 * booking, attendance and conversion). Read-only — stage moves, booking links
 * and conversion stay with Odoo's own flows.
 */

export type CrmStage = { id: number; name: string; won: boolean };

export type CrmLead = {
  id: number;
  name: string;
  contact: string;
  phone: string | null;
  email: string | null;
  stageId: number | null;
  stage: string | null;
  score: number;
  source: string | null;
  trialSession: string | null;
  trialAttended: boolean;
  noShow: boolean;
  converted: boolean;
  member: string | null;
  createdAt: string;
};

type LeadRow = {
  id: number;
  name: string;
  contact_name: string | false;
  partner_name: string | false;
  phone: string | false;
  email_from: string | false;
  stage_id: Many2one;
  dojo_lead_score: number;
  source_id: Many2one;
  trial_session_id: Many2one;
  trial_attended: boolean;
  no_show: boolean;
  is_converted: boolean;
  dojo_member_id: Many2one;
  create_date: string;
};

const LEAD_FIELDS = [
  'name',
  'contact_name',
  'partner_name',
  'phone',
  'email_from',
  'stage_id',
  'dojo_lead_score',
  'source_id',
  'trial_session_id',
  'trial_attended',
  'no_show',
  'is_converted',
  'dojo_member_id',
  'create_date',
];

function toLead(l: LeadRow): CrmLead {
  return {
    id: l.id,
    name: l.name,
    contact: l.contact_name || l.partner_name || l.name,
    phone: l.phone || null,
    email: l.email_from || null,
    stageId: l.stage_id ? l.stage_id[0] : null,
    stage: m2oName(l.stage_id),
    score: l.dojo_lead_score,
    source: m2oName(l.source_id),
    trialSession: m2oName(l.trial_session_id),
    trialAttended: l.trial_attended,
    noShow: l.no_show,
    converted: l.is_converted,
    member: m2oName(l.dojo_member_id),
    createdAt: fromOdooDatetime(l.create_date).toISOString(),
  };
}

export async function loadStages(): Promise<CrmStage[]> {
  const rows = await searchRead<{ id: number; name: string; is_won: boolean }>('crm.stage', [], ['name', 'is_won'], {
    order: 'sequence asc, id asc',
  });
  return rows.map((s) => ({ id: s.id, name: s.name, won: s.is_won }));
}

export async function loadLeads({
  q,
  stageId,
  page,
  limit = 25,
}: {
  q?: string;
  stageId?: number | null;
  page: number;
  limit?: number;
}): Promise<{ leads: CrmLead[]; total: number; pages: number }> {
  const domain: unknown[] = [];
  if (stageId) domain.push(['stage_id', '=', stageId]);
  if (q) domain.push('|', '|', '|', ['name', 'ilike', q], ['contact_name', 'ilike', q], ['phone', 'ilike', q], ['email_from', 'ilike', q]);

  const [total, rows] = await Promise.all([
    searchCount('crm.lead', domain),
    searchRead<LeadRow>('crm.lead', domain, LEAD_FIELDS, { order: 'create_date desc', limit, offset: (page - 1) * limit }),
  ]);
  return { total, pages: Math.max(1, Math.ceil(total / limit)), leads: rows.map(toLead) };
}

/** Leads not yet in a won stage. */
export function countOpenLeads() {
  return searchCount('crm.lead', [['stage_id.is_won', '=', false]]);
}

/** Open leads for the board, newest first, capped. */
export async function loadBoard(): Promise<{ stages: CrmStage[]; leads: CrmLead[] }> {
  const [stages, rows] = await Promise.all([
    loadStages(),
    searchRead<LeadRow>('crm.lead', [], LEAD_FIELDS, { order: 'create_date desc', limit: 300 }),
  ]);
  return { stages, leads: rows.map(toLead) };
}
