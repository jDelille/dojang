import type { StepAction } from '@prisma/client';

/**
 * Client-safe half of the retention engine: types and labels only.
 *
 * lib/retention.ts imports Twilio, Nodemailer and web-push, which cannot be
 * bundled for the browser. The rule-builder UI needs the labels and the step
 * shape, so they live here and lib/retention.ts re-exports them.
 */

export type RetentionStep = {
  action: StepAction;
  /** Delay before this step runs, relative to the previous step. */
  delayMinutes?: number;
  subject?: string;
  body?: string;
  tag?: string;
  stageKey?: string;
  /** Branch: skip the rest of the sequence if the contact already replied. */
  skipIfReplied?: boolean;
  /** Branch: only run this step if the previous email was opened/clicked. */
  requireOpened?: boolean;
};

export type RetentionLogEntry = {
  at: string;
  stepIndex: number;
  action: string;
  status: 'sent' | 'skipped' | 'failed' | 'dry-run';
  detail?: string;
};

export const TRIGGER_LABELS: Record<string, string> = {
  no_activity: 'No activity for N days',
  lead_created: 'New lead created',
  lead_status_changed: 'Lead reaches a status',
  appointment_booked: 'Appointment booked',
  appointment_completed: 'Appointment completed',
  invoice_paid: 'Invoice paid',
  missed_call: 'Missed call',
  tag_added: 'Tag added to contact',
  manual: 'Manual / on demand',
};

export const ACTION_LABELS: Record<StepAction, string> = {
  send_email: 'Send email',
  send_sms: 'Send SMS',
  send_push: 'Send push notification',
  add_tag: 'Add tag',
  remove_tag: 'Remove tag',
  change_stage: 'Move pipeline stage',
  create_task: 'Create task',
  notify_team: 'Notify the team',
  request_review: 'Request a review',
  wait: 'Wait',
};

export function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export function parseSteps(value: unknown): RetentionStep[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is RetentionStep => Boolean(s) && typeof s === 'object');
}
