/**
 * The Companion's Odoo workflow: the same path v1's dock used
 * (/kiosk/v2/staff/companion-workflow and /kiosk/v2/staff/companion-review).
 *
 * Server only. The kiosk token and staff gateway key never reach the browser,
 * and the browser never picks the operation's scope: Odoo checks every member
 * and session against its own allowlist on dojo.kiosk.config.
 *
 * Nothing here sends a message or changes a booking. Prepare saves a draft for
 * review, approve marks it saved internally, review saves an attendance
 * receipt. Odoo is the only place a model runs.
 */
import { randomUUID } from 'node:crypto';

export type OdooSuggestion = {
  id: string;
  title: string;
  explanation: string;
  actionLabel: string;
  capability: string;
  risk: 'low' | 'medium' | 'high';
  preview: { label: string; value: string }[];
};

export type OdooReceipt = { id: string; suggestionId: string; summary: string; actor: string; at: string };

export type OdooFollowUp = {
  id: string;
  memberId: string;
  sessionId: string;
  memberName: string;
  summary: string;
  replyDraft: string;
  at: string;
  status: string;
  mode: string;
};

export type OdooSession = { sessionId: string; title: string; startsAt: string; endsAt: string };

export type OdooContext = {
  heading: string;
  sessions: OdooSession[];
  roster: { memberId: string; displayName: string; attendanceState: string }[];
  followUps: OdooFollowUp[];
  followUpEnabled: boolean;
  aiEnabled: boolean;
  suggestions: OdooSuggestion[];
  intel: { label: string; value: string }[];
};

export type AskReply =
  | { outcome: 'answer'; answer: string; mode: string }
  | { outcome: 'notUnderstood' }
  | { outcome: 'unavailable' };

/** Problems Odoo can return, mapped to what the panel shows. */
export class CompanionProblem extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const RECORD_ID = /^[1-9][0-9]{0,9}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{15,127}$/;

export const isRecordId = (v: unknown): v is string => typeof v === 'string' && RECORD_ID.test(v);
export const isKey = (v: unknown): v is string => typeof v === 'string' && KEY.test(v);

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.length <= max;

export function companionOdooConfigured() {
  return !!(process.env.ODOO_URL && process.env.DOJANG_KIOSK_TOKEN && process.env.DOJANG_STAFF_GATEWAY_KEY);
}

async function rpc(path: string, params: Record<string, unknown>, timeout: number): Promise<Record<string, unknown>> {
  const base = process.env.ODOO_URL!.replace(/\/+$/, '');
  const res = await fetch(base + path, {
    method: 'POST',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DOJANG_STAFF_GATEWAY_KEY}` },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `roster-${randomUUID()}`,
      method: 'call',
      params: { token: process.env.DOJANG_KIOSK_TOKEN, ...params },
    }),
  });
  if (!res.ok) throw new Error(`Companion workflow failed (${res.status})`);
  const body: unknown = await res.json();
  if (!obj(body) || body.error || !obj(body.result)) throw new Error('Invalid companion workflow reply');
  const result = body.result;
  if (obj(result.problem)) throw new CompanionProblem(String(result.problem.code));
  return result;
}

const workflow = (operation: string, payload: Record<string, unknown>) =>
  rpc('/kiosk/v2/staff/companion-workflow', { operation, payload }, 40_000);

function validSuggestion(v: unknown): v is OdooSuggestion {
  return (
    obj(v) &&
    str(v.id, 80) &&
    str(v.title) &&
    str(v.explanation) &&
    str(v.actionLabel) &&
    Array.isArray(v.preview) &&
    v.preview.every((p) => obj(p) && str(p.label, 100) && str(p.value))
  );
}

function validReceipt(v: unknown, suggestionId: string): v is OdooReceipt {
  return obj(v) && isRecordId(v.id) && v.suggestionId === suggestionId && str(v.summary) && str(v.actor) && str(v.at);
}

/** The read-only attendance review v1 offered on every member page. */
function attendanceSuggestion(memberId: string, data: Record<string, unknown>): OdooSuggestion | null {
  const attendance = data.attendance;
  if (!obj(attendance)) return null;
  const latest = obj(attendance.latest) ? attendance.latest : null;
  return {
    id: `attendance-review:${memberId}`,
    title: 'Review verified attendance',
    explanation:
      "Read this member's attendance from Odoo and save a review receipt. No membership, billing, rank or messages change.",
    actionLabel: 'Verify attendance',
    capability: 'attendance.read',
    risk: 'low',
    preview: [
      { label: 'Source', value: 'Odoo' },
      { label: 'Check-ins in 7 days', value: String(attendance.lastSevenDays ?? 0) },
      { label: 'Latest class', value: latest && str(latest.sessionTitle) ? latest.sessionTitle : 'No recorded check-in' },
      { label: 'Mode', value: 'Guided lookup, not generative AI' },
    ],
  };
}

export async function loadOdooContext(memberId: string | null, sessionId: string | null): Promise<OdooContext> {
  const result = await workflow('context', {
    ...(memberId ? { memberId } : {}),
    ...(sessionId ? { sessionId } : {}),
  });
  const sessions = Array.isArray(result.sessions) ? result.sessions.filter(obj) : [];
  const roster = Array.isArray(result.roster) ? result.roster.filter(obj) : [];
  const followUps = Array.isArray(result.followUps) ? result.followUps.filter(obj) : [];
  const aiEnabled = result.aiEnabled === true;

  const suggestions: OdooSuggestion[] = [];
  if (memberId) {
    // A member outside Odoo's allowlist fails here; the rest of the context still shows.
    const member = await rpc('/kiosk/v2/staff/member', { memberId }, 10_000).catch(() => null);
    const review = member && attendanceSuggestion(memberId, member);
    if (review) suggestions.push(review);
  }

  const pending = roster.filter((r) => r.attendanceState === 'pending').length;
  return {
    heading: sessionId ? (str(result.sessionTitle) ? result.sessionTitle : 'Class roster') : memberId ? 'Member companion' : 'Staff companion',
    sessions: sessions.map((s) => ({
      sessionId: String(s.sessionId),
      title: String(s.title),
      startsAt: String(s.startsAt),
      endsAt: String(s.endsAt),
    })),
    roster: roster.map((r) => ({
      memberId: String(r.memberId),
      displayName: String(r.displayName),
      attendanceState: String(r.attendanceState),
    })),
    followUps: followUps.map((f) => ({
      id: String(f.id),
      memberId: String(f.memberId),
      sessionId: String(f.sessionId),
      memberName: String(f.memberName),
      summary: String(f.summary),
      replyDraft: String(f.replyDraft),
      at: String(f.at),
      status: String(f.status),
      mode: String(f.mode),
    })),
    followUpEnabled: result.followUpEnabled === true,
    aiEnabled,
    suggestions,
    intel: [
      { label: 'Drafting', value: aiEnabled ? 'Configured AI provider; templates if unavailable' : 'Template mode; AI not enabled' },
      { label: 'Follow-up', value: 'Internal review queue. No outbound messages or automatic bookings.' },
      ...(sessionId ? [{ label: 'Not yet checked in', value: String(pending) }] : []),
    ],
  };
}

export async function askOdoo(text: string, memberId: string | null, sessionId: string | null): Promise<AskReply> {
  try {
    const result = await workflow('ask', {
      text,
      ...(memberId ? { memberId } : {}),
      ...(sessionId ? { sessionId } : {}),
    });
    if (result.outcome === 'notUnderstood') return { outcome: 'notUnderstood' };
    if (result.outcome === 'answer' && str(result.answer, 1800) && str(result.mode, 200)) {
      return { outcome: 'answer', answer: result.answer, mode: result.mode };
    }
    return { outcome: 'unavailable' };
  } catch (error) {
    console.error('[companion] ask failed', error instanceof CompanionProblem ? error.code : error);
    return { outcome: 'unavailable' };
  }
}

export async function prepareFollowUp(input: {
  memberId: string;
  sessionId: string;
  text: string;
  idempotencyKey: string;
  correlationId: string;
}): Promise<OdooSuggestion> {
  const result = await workflow('prepare', input);
  if (result.outcome !== 'newTask' || !validSuggestion(result.suggestion)) throw new Error('Invalid follow-up proposal');
  return result.suggestion;
}

export type ApprovalCommand = { memberId: string; suggestionId: string; idempotencyKey: string; correlationId: string };

/** Approves a prepared follow-up, or saves an attendance review receipt. */
export async function approveSuggestion(command: ApprovalCommand): Promise<{ receipt: OdooReceipt; replayed: boolean }> {
  const result = command.suggestionId.startsWith('followup:')
    ? await workflow('approve', command)
    : await rpc('/kiosk/v2/staff/companion-review', { command }, 10_000);
  const evidence = result.evidence;
  if (
    !validReceipt(result.receipt, command.suggestionId) ||
    result.correlationId !== command.correlationId ||
    typeof result.replayed !== 'boolean' ||
    !obj(evidence) ||
    evidence.memberId !== command.memberId
  ) {
    throw new Error('Invalid receipt');
  }
  const r = result.receipt;
  return { receipt: { id: r.id, suggestionId: r.suggestionId, summary: r.summary, actor: r.actor, at: r.at }, replayed: result.replayed };
}

/** HTTP status for an Odoo problem code, so the panel can tell "no" from "maybe". */
export function problemStatus(code: string) {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'INVALID_COMMAND') return 400;
  if (['VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'ATTENDANCE_REVIEW_REQUIRED', 'NOT_ON_ROSTER'].includes(code)) return 409;
  return 503;
}

export type ReadinessProbe = {
  memberCount: number;
  sessionCount: number;
  followUpEnabled: boolean;
  aiEnabled: boolean;
  aiCredentialConfigured: boolean;
  ebGymInstalled: boolean;
};

/**
 * v1's readiness check (Jodi #9/#14): one real round trip through the staff
 * gateway. Returns only counts and on/off flags, never member details.
 */
export async function probeReadiness(): Promise<ReadinessProbe> {
  const [members, context, capabilities] = await Promise.all([
    rpc('/kiosk/v2/staff/members', {}, 10_000),
    workflow('context', {}),
    workflow('readiness', {}),
  ]);
  if (!Array.isArray(members.members) || !Array.isArray(context.sessions) || typeof context.followUpEnabled !== 'boolean') {
    throw new Error('Invalid readiness reads');
  }
  const flags = ['followUpEnabled', 'aiEnabled', 'aiCredentialConfigured', 'ebGymInstalled'];
  if (capabilities.schema !== 'dojang-readiness-v1' || flags.some((flag) => typeof capabilities[flag] !== 'boolean')) {
    throw new Error('Invalid readiness capabilities');
  }
  return {
    memberCount: members.members.length,
    sessionCount: context.sessions.length,
    followUpEnabled: capabilities.followUpEnabled === true,
    aiEnabled: capabilities.aiEnabled === true,
    aiCredentialConfigured: capabilities.aiCredentialConfigured === true,
    ebGymInstalled: capabilities.ebGymInstalled === true,
  };
}
