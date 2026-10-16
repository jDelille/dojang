/** Shapes and constants shared by the Retention panels. */

import { ACTION_LABELS, type RetentionStep } from '@/lib/retention-shared';

export type StepAction = RetentionStep['action'];

export type Rule = {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  steps: RetentionStep[];
  isActive: boolean;
  lastRunAt: string | null;
  _count: { runs: number };
  completedRuns: number;
};

export type Template = {
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  steps: RetentionStep[];
};

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type Run = {
  id: string;
  stepIndex: number;
  status: RunStatus;
  nextRunAt: string | null;
  lastError: string | null;
  isDryRun: boolean;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; name: string | null; email: string | null } | null;
};

export type Stage = { id: string; key: string; name: string };

export type RunFilter = 'all' | 'active' | 'completed' | 'failed';

export const RUN_TONES: Record<RunStatus, 'neutral' | 'success' | 'alert' | 'warning' | 'info'> = {
  pending: 'info',
  running: 'warning',
  completed: 'success',
  failed: 'alert',
  cancelled: 'neutral',
};

export const RUN_LABELS: Record<RunStatus, string> = {
  pending: 'Waiting',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/**
 * `create_task` writes rows the product cannot read back yet — there is no
 * tasks surface — so it is kept out of the builder rather than offered as a
 * step that silently loses work. Rules that already use it still edit fine.
 */
export const UNAVAILABLE_ACTIONS: StepAction[] = ['create_task'];

export const ACTIONS = (Object.keys(ACTION_LABELS) as StepAction[]).filter(
  (action) => !UNAVAILABLE_ACTIONS.includes(action),
);

export const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';
