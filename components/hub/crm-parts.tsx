'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Badge, Button, Field, Input, Textarea } from '@/components/ui';
import type { BadgeTone } from '@/components/ui/data';
import { PANEL } from '@/components/odoo/shared';
import { Notice } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/** Pieces shared by the Sales page and the lead page. Ported from Jodi's CrmWorkspace and CrmIntelligence. */

export const TEXT = 'text-[13px]';
export const SUBTLE_LINK = 'text-[13px] font-semibold underline underline-offset-4';

export type LeadEvidence = {
  score: number;
  scoreKind: string;
  method: string;
  journey: string;
  priority: 'Low' | 'Normal' | 'High' | 'Now';
  priorityReason: string;
  nextAction: string;
  risk: string;
  openTasks: number;
  overdueTasks: number;
  dueToday: number;
  trialLinked: boolean;
  memberLinked: boolean;
  reasons: { label: string; points: number; available: number; recorded: boolean }[];
};
export type Lead = {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  version: number;
  stageId: string | null;
  stage: string;
  ownerId: string | null;
  owner: string;
  source: string;
  tags: { id: string; name: string }[];
  canEditContact: boolean;
  evidence?: LeadEvidence;
};
export type Task = {
  id: string;
  relatedType: 'lead' | 'member';
  relatedId: string;
  relatedName: string;
  summary: string;
  due: string;
  owner: string;
  state: string;
  version: number;
  canComplete: boolean;
  feedback: string;
};
export type Stage = { id: string; name: string };
export type CrmContext = {
  leads: Lead[];
  tasks: Task[];
  stages: Stage[];
  members: { id: string; name: string }[];
  moreLeads: boolean;
  moreTasks: boolean;
  assignees?: { id: string; name: string }[];
};

/** One write waiting for staff to confirm it: where it goes and what it will do, in words. */
export type Review = { path: string; payload: Record<string, unknown>; expectedVersion?: number; description: string };

export const leadHref = (id: string) => `/dashboard/sales/leads/${id}`;
export const memberHref = (id: string) => `/dashboard/contacts/${id}`;

export function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

/** Read a submitted form's fields as text. */
export function formText(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  return (name: string) => String(form.get(name) ?? '');
}

const PRIORITY_TONE: Record<string, BadgeTone> = { Now: 'alert', High: 'warning', Normal: 'info', Low: 'neutral' };
const PRIORITY_ORDER: Record<string, number> = { Now: 0, High: 1, Normal: 2, Low: 3 };

export function priorityRank(lead: Lead) {
  return PRIORITY_ORDER[lead.evidence?.priority ?? ''] ?? 4;
}

function PriorityBadge({ priority, suffix = '' }: { priority?: string; suffix?: string }) {
  if (!priority) return <Badge>Priority unavailable</Badge>;
  return (
    <Badge tone={PRIORITY_TONE[priority] ?? 'neutral'}>
      {priority}
      {suffix}
    </Badge>
  );
}

/** Counts across the loaded leads (up to 100). */
export function CrmPulse({ leads, onPriority }: { leads: Lead[]; onPriority: () => void }) {
  if (leads.some((lead) => !lead.evidence)) {
    return <Notice>Pipeline intelligence is unavailable until the matching CRM update is installed in Odoo.</Notice>;
  }
  const open = leads.filter((lead) => !['Won', 'Lost'].includes(lead.evidence!.journey));
  const needAttention = open.filter((lead) => ['Now', 'High'].includes(lead.evidence!.priority));
  const tiles = [
    { label: 'Open leads', value: open.length },
    { label: 'Linked trials', value: open.filter((lead) => lead.evidence!.trialLinked).length },
    { label: 'In nurture', value: open.filter((lead) => lead.evidence!.journey === 'Nurture').length },
  ];
  const tile = 'rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] px-4 py-3 text-start';
  return (
    <section aria-label="Loaded pipeline summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className={tile}>
        <p className="text-xl font-semibold">{tiles[0].value}</p>
        <p className={cn(TEXT, 'muted')}>{tiles[0].label}</p>
      </div>
      <button type="button" onClick={onPriority} className={cn(tile, 'hover:border-accent')}>
        <p className="text-xl font-semibold">{needAttention.length}</p>
        <p className={cn(TEXT, 'muted')}>Need attention →</p>
      </button>
      {tiles.slice(1).map((item) => (
        <div key={item.label} className={tile}>
          <p className="text-xl font-semibold">{item.value}</p>
          <p className={cn(TEXT, 'muted')}>{item.label}</p>
        </div>
      ))}
    </section>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const score = lead.evidence ? Math.min(100, Math.max(0, lead.evidence.score)) : 0;
  return (
    <article className="space-y-2 rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-3">
      <div className={cn(TEXT, 'flex flex-wrap items-center justify-between gap-2')}>
        <PriorityBadge priority={lead.evidence?.priority} />
        <span className="muted">{lead.evidence ? `${lead.evidence.score}/100 evidence` : 'Evidence unavailable'}</span>
      </div>
      {lead.evidence && (
        <div aria-hidden className="h-1 overflow-hidden rounded-full bg-[color:var(--color-border)]">
          <div className="h-full bg-accent" style={{ width: `${score}%` }} />
        </div>
      )}
      <h3 className="text-sm font-semibold">
        <Link href={leadHref(lead.id)} className="hover:underline">
          {lead.name}
        </Link>
      </h3>
      <p className={TEXT}>{lead.contact || 'Contact not recorded'}</p>
      <p className={cn(TEXT, 'muted')}>
        {lead.owner} · {lead.stage}
      </p>
      {lead.evidence && <p className={cn(TEXT, 'muted')}>{lead.evidence.priorityReason}</p>}
    </article>
  );
}

/** Leads as a list, or as a board with one column per configured stage. */
export function LeadPipeline({ leads, stages, board }: { leads: Lead[]; stages: Stage[]; board: boolean }) {
  if (!board) {
    if (!leads.length) return <p className={TEXT}>No matching leads.</p>;
    return (
      <section aria-label="Lead pipeline" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </section>
    );
  }

  const hasStage = (lead: Lead) => Boolean(lead.stageId) && stages.some((stage) => stage.id === lead.stageId);
  const columns = [...stages];
  if (leads.some((lead) => !hasStage(lead))) columns.push({ id: 'other', name: 'Other / unassigned' });

  return (
    <section aria-label="Lead pipeline" className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((stage) => {
        const rows = leads.filter((lead) => (stage.id === 'other' ? !hasStage(lead) : lead.stageId === stage.id));
        return (
          <section key={stage.id} aria-label={`Stage ${stage.name}`} className="w-64 shrink-0 space-y-2">
            <header className="flex items-center justify-between text-sm font-semibold">
              <h3>{stage.name}</h3>
              <span className="muted">{rows.length}</span>
            </header>
            {rows.length ? rows.map((lead) => <LeadCard key={lead.id} lead={lead} />) : <p className={cn(TEXT, 'muted')}>No matching leads</p>}
          </section>
        );
      })}
    </section>
  );
}

export function EvidenceDetail({ value }: { value?: LeadEvidence }) {
  if (!value) return <Notice>Evidence is unavailable. The matching CRM update must be installed in Odoo first.</Notice>;
  return (
    <section aria-label="Lead evidence" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{value.journey}</h3>
        <PriorityBadge priority={value.priority} suffix=" priority" />
      </div>
      <p className={TEXT}>{value.priorityReason}</p>
      <div className="flex items-baseline gap-3">
        <p className="text-2xl font-semibold">
          {value.score}
          <span className="text-sm muted">/100</span>
        </p>
        <p className={cn(TEXT, 'muted')}>
          {value.scoreKind}. The configured stage describes the journey; it does not prove a message, payment or trial attendance.
        </p>
      </div>
      <details className={TEXT}>
        <summary className="cursor-pointer font-semibold">How this score is calculated</summary>
        <ul className="mt-2 space-y-1">
          {value.reasons.map((reason) => (
            <li key={reason.label} className="flex justify-between gap-3">
              <span>{reason.label}</span>
              <strong>
                {reason.points}/{reason.available}
              </strong>
            </li>
          ))}
        </ul>
        <p className="mt-2 muted">Fixed evidence weights · {value.method}. No pricing, eligibility or conversion decision is made by this score.</p>
      </details>
    </section>
  );
}

/** A collapsible block inside a panel. */
export function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-control border border-[color:var(--color-border)] px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

/** Create a lead, or change an existing lead's title and contact fields. */
export function LeadForm({ lead, disabled, onReview }: { lead?: Lead; disabled: boolean; onReview: (review: Review) => void }) {
  const contactLocked = Boolean(lead && !lead.canEditContact);

  function submit(event: FormEvent<HTMLFormElement>) {
    const get = formText(event);
    const values: Record<string, string> = { name: get('name'), contact: get('contact'), email: get('email'), phone: get('phone') };
    if (!values.name.trim()) return;

    if (!lead) {
      const summary = Object.entries(values)
        .map(([key, value]) => `${key} → ${value || '(empty)'}`)
        .join('; ');
      onReview({ path: 'leads', payload: values, description: `Create lead: ${summary}. No stage change or customer message.` });
      return;
    }

    const changes: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      const current = lead[key as 'name' | 'contact' | 'email' | 'phone'];
      const editable = key === 'name' || lead.canEditContact;
      if (editable && value !== current) changes[key] = value;
    }
    if (!Object.keys(changes).length) return;
    const summary = Object.entries(changes)
      .map(([key, value]) => `${key} → ${value || '(empty)'}`)
      .join('; ');
    onReview({
      path: `leads/${lead.id}/details`,
      payload: { changes },
      expectedVersion: lead.version,
      description: `Update ${lead.name}: ${summary}. No stage change or customer message.`,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lead title">
          <Input name="name" defaultValue={lead?.name ?? ''} required maxLength={200} disabled={disabled} />
        </Field>
        <Field label="Contact name">
          <Input name="contact" defaultValue={lead?.contact ?? ''} maxLength={200} disabled={disabled || contactLocked} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={lead?.email ?? ''} maxLength={200} disabled={disabled || contactLocked} />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" defaultValue={lead?.phone ?? ''} maxLength={200} disabled={disabled || contactLocked} />
        </Field>
      </div>
      {contactLocked && <p className={cn(TEXT, 'muted')}>Linked contact: edit contact details in Odoo to protect shared member and family records.</p>}
      <Button type="submit" variant="secondary" disabled={disabled}>
        {lead ? 'Review lead changes' : 'Review new lead'}
      </Button>
    </form>
  );
}

/** Tasks with their related lead or member, and a completion form where Odoo allows it. */
export function TaskRows({ tasks, disabled, onReview }: { tasks: Task[]; disabled: boolean; onReview: (review: Review) => void }) {
  if (!tasks.length) return <p className={TEXT}>No tasks in this view.</p>;
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} disabled={disabled} onReview={onReview} />
      ))}
    </div>
  );
}

function TaskRow({ task, disabled, onReview }: { task: Task; disabled: boolean; onReview: (review: Review) => void }) {
  const [outcome, setOutcome] = useState('');
  const related = task.relatedType === 'lead' ? leadHref(task.relatedId) : memberHref(task.relatedId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const feedback = outcome.trim();
    if (!feedback) return;
    onReview({
      path: `tasks/${task.id}/completion`,
      payload: { feedback },
      expectedVersion: task.version,
      description: `Complete “${task.summary}” for ${task.relatedName}. Outcome: ${feedback}. This records completion only; it does not change a stage, send a message or charge a payment.`,
    });
  }

  return (
    <article aria-label={`Task ${task.id}`} className="space-y-2 rounded-control border border-[color:var(--color-border)] px-3 py-2">
      <p className="text-sm font-semibold">{task.summary}</p>
      <p className={cn(TEXT, 'muted')}>
        {task.relatedName} · {task.owner} · Due {task.due} · {task.state}
      </p>
      <Link href={related} className={SUBTLE_LINK}>
        {task.relatedType === 'lead' ? 'Open related lead →' : 'Open related member →'}
      </Link>
      {task.canComplete ? (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Field label="Outcome">
              <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} required maxLength={1000} disabled={disabled} />
            </Field>
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={disabled || !outcome.trim()}>
            Review task completion
          </Button>
        </form>
      ) : task.state === 'done' ? (
        <p className={TEXT}>Outcome: {task.feedback || 'Recorded in Odoo'}</p>
      ) : (
        <p className={cn(TEXT, 'muted')}>Managed by an Odoo workflow; review it there before completing.</p>
      )}
    </article>
  );
}

/** The "Review before saving" step for one CRM write. */
export function ReviewCard({
  review,
  busy,
  locked,
  onConfirm,
  onCancel,
  reviewRef,
}: {
  review: Review | null;
  busy: boolean;
  locked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  reviewRef: React.RefObject<HTMLElement | null>;
}) {
  if (!review) return null;
  return (
    <section
      ref={reviewRef as React.RefObject<HTMLElement>}
      tabIndex={-1}
      aria-label="Review CRM action"
      className={cn(PANEL, 'space-y-3 border-accent outline-none')}
    >
      <h2 className="text-base font-semibold">Review before saving</h2>
      <p className={TEXT}>{review.description}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || locked} onClick={onConfirm}>
          {busy ? 'Saving…' : 'Confirm CRM action in Odoo'}
        </Button>
        <Button variant="ghost" disabled={busy || locked} onClick={onCancel}>
          Cancel review
        </Button>
      </div>
    </section>
  );
}

/** Text area field used by several CRM forms. */
export function NoteField({ label, name, maxLength, disabled }: { label: string; name: string; maxLength: number; disabled: boolean }) {
  return (
    <Field label={label}>
      <Textarea name={name} required maxLength={maxLength} disabled={disabled} />
    </Field>
  );
}
