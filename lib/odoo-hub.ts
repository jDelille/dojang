import 'server-only';
import { decryptJson, encryptJson } from '@/lib/crypto';

/**
 * The Odoo companion hub (Jodi's `dojo_companion_hub` addon), ported from v1's
 * `src/server/hub-gateway.ts`.
 *
 * Every hub call runs as the signed-in staff member's own Odoo user: Odoo
 * checks their `dojo.hub.grant` role and record scope on each action (Paul's
 * rule: real principal server-side, no caller-chosen roles, no model-chosen
 * ORM calls). The Odoo password passes through once at connect and is never
 * stored; only Odoo's session id is kept, sealed in an HttpOnly cookie that is
 * bound to this Roster user and workspace.
 *
 * Every operation Jodi's hub exposes (her gateway at 07afe25) is allowed, with
 * the same result checks. Odoo still decides, per staff role, who may run each.
 */

export const HUB_COOKIE = 'roster_odoo_hub';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const READS = new Set([
  'context',
  // Members
  'member_details',
  'member_workspace',
  'member_onboarding',
  'archive_review',
  'archived_members',
  // Intake and trials
  'intake_context',
  'intake_preview',
  'trial_context',
  'conversion_preview',
  // Billing and refunds
  'billing_ledger',
  'refund_preview',
  // Classes, courses and attendance
  'attendance_sessions',
  'attendance_sheet',
  'session_roster',
  'course_roster',
  'course_assignment_preview',
  // Waiver, consent, broadcasts, automations
  'waiver_context',
  'consent_overview',
  'broadcast_context',
  'broadcast_preview',
  'automation_overview',
  // Guardian kiosk PIN
  'guardian_kiosk_access',
  // CRM
  'crm_context',
  'lead_details',
  // Belt testing
  'testing_eligibility',
  'testing_roster',
  'promotion_preview',
  'promotion_history',
  // Instructor, reports, setup, AI
  'instructor_context',
  'operations_report',
  'setup_checklist',
  'ai_settings',
]);

/** Writes whose result Roster checks before calling it saved. */
const WRITE_STATES: Record<string, string[]> = {
  create_student: ['student_created'],
  reserve_trial: ['trial_reserved'],
  cancel_trial: ['trial_cancelled'],
  record_trial_outcome: ['trial_attended', 'trial_no_show'],
  convert_trial: ['trial_converted'],
  mark_attendance: ['attendance_recorded'],
  update_member_photo: ['photo_updated', 'photo_removed'],
  sign_waiver: ['waiver_signed'],
  record_consent: ['consent_recorded'],
  save_testing_roster: ['testing_roster_saved'],
  record_test_results: ['test_results_saved'],
  promote_test_results: ['promotions_awarded'],
  reverse_promotion: ['promotion_reversed'],
  archive_member: ['archived'],
  restore_member: ['restored'],
  assign_course_members: ['course_roster_updated'],
  set_guardian_kiosk_pin: ['guardian_pin_set'],
  revoke_guardian_kiosk_pin: ['guardian_pin_revoked'],
  create_broadcast: ['broadcast_awaiting_approval'],
  approve_broadcast: ['broadcast_approved'],
  cancel_broadcast: ['broadcast_cancelled'],
  set_automation_active: ['automation_paused', 'automation_resumed'],
  request_refund: ['refund_requested'],
  approve_refund: ['refund_approved'],
  record_refund_payment: ['refund_payment_recorded'],
  cancel_refund: ['refund_cancelled'],
};

/** Shift writes: the receipt must carry the exact native shift (see checkShift). */
const SHIFT_WRITES = new Set(['instructor_clock', 'correct_timesheet']);

/** Writes Jodi's gateway passes through on Odoo's word alone. */
const PLAIN_WRITES = new Set([
  'book',
  'change_class',
  'checkout',
  'update_member',
  'rank',
  'payment_link',
  'create_lead',
  'update_lead',
  'add_lead_note',
  'create_task',
  'complete_task',
  'propose_stage',
  'prepare_lead_action',
  'assign_lead',
  'enable_ai',
  // Inbox: parent messages, drafts, replies, guardian links, staff accounts
  'resolve',
  'draft',
  'approve_reply',
  'link_guardian',
  'provision',
]);

const LARGE = new Set(['update_member_photo', 'sign_waiver']);
const TRIAL_WRITES = new Set(['reserve_trial', 'cancel_trial', 'record_trial_outcome', 'convert_trial']);
const TESTING_WRITES = new Set(['save_testing_roster', 'record_test_results', 'promote_test_results']);
const REFUND_WRITES = new Set(['request_refund', 'approve_refund', 'record_refund_payment', 'cancel_refund']);
const BROADCAST_WRITES = new Set(['create_broadcast', 'approve_broadcast', 'cancel_broadcast']);
const PIN_WRITES = new Set(['set_guardian_kiosk_pin', 'revoke_guardian_kiosk_pin']);

export function isHubOperation(op: string) {
  return READS.has(op) || op in WRITE_STATES || SHIFT_WRITES.has(op) || PLAIN_WRITES.has(op);
}
export function isHubRead(op: string) {
  return READS.has(op);
}
export function isLargeHubOperation(op: string) {
  return LARGE.has(op);
}

type Config = { backend: string; database: string; siteId: string };

export function hubConfig(): Config | null {
  const raw = process.env.ODOO_URL;
  const database = process.env.ODOO_DB ?? '';
  const siteId = process.env.DOJANG_HUB_SITE_ID ?? '';
  if (!raw || !/^[A-Za-z0-9_-]{1,63}$/.test(database) || !/^[1-9][0-9]{0,9}$/.test(siteId)) return null;
  try {
    const url = new URL(raw);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password) return null;
    return { backend: url.origin, database, siteId };
  } catch {
    return null;
  }
}

/** A hub failure with the stable code Odoo (or this gateway) gave it. */
export class HubError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

async function rpc(c: Config, path: string, params: Record<string, unknown>, session: string | null, timeout = 45000) {
  const response = await fetch(c.backend + path, {
    method: 'POST',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
    headers: { 'content-type': 'application/json', ...(session ? { cookie: `session_id=${session}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params }),
  });
  if (!response.ok) throw new Error('Backend unavailable');
  const value: unknown = await response.json();
  // An expired Odoo session means nothing ran, so asking to reconnect is safe.
  if (isObject(value) && isObject(value.error) && Number(value.error.code) === 100) {
    throw new HubError('SIGN_IN_REQUIRED', 401);
  }
  if (!isObject(value) || value.error) throw new Error('Backend rejected request');
  return { response, result: value.result };
}

/** The staff member's role in their `dojo.hub.grant`, as Odoo reported it at sign-in. */
export type HubRole = 'owner' | 'manager' | 'instructor' | 'guardian' | 'member';
const HUB_ROLES: readonly string[] = ['owner', 'manager', 'instructor', 'guardian', 'member'];
export const isHubRole = (v: unknown): v is HubRole => typeof v === 'string' && HUB_ROLES.includes(v);

type Sealed = { session: string; role: HubRole; userId: string; workspaceId: string; scope: string; expires: number };
const scopeOf = (c: Config) => `${c.backend}|${c.database}|${c.siteId}`;

export function sealSession(c: Config, session: string, role: HubRole, userId: string, workspaceId: string) {
  return encryptJson({ session, role, userId, workspaceId, scope: scopeOf(c), expires: Date.now() + SESSION_TTL_MS });
}

/**
 * The Odoo session and hub role from the cookie, only if it was sealed for this
 * Roster user and workspace. The role is a hint for the UI and early refusals;
 * Odoo re-checks the grant on every call.
 */
export function openSession(c: Config, cookie: string | undefined, userId: string, workspaceId: string) {
  if (!cookie || cookie.length > 4096) return null;
  try {
    const v = decryptJson<Sealed>(cookie);
    if (
      v.userId !== userId ||
      v.workspaceId !== workspaceId ||
      v.scope !== scopeOf(c) ||
      !Number.isSafeInteger(v.expires) ||
      v.expires <= Date.now() ||
      v.expires > Date.now() + SESSION_TTL_MS ||
      typeof v.session !== 'string' ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(v.session) ||
      !isHubRole(v.role)
    ) {
      return null;
    }
    return { session: v.session, role: v.role };
  } catch {
    return null;
  }
}

export const HUB_COOKIE_MAX_AGE = SESSION_TTL_MS / 1000;

/** Signs in to Odoo as this staff member and confirms they have hub access. */
export async function connectHub(c: Config, login: string, password: string) {
  let session: string | undefined;
  try {
    const { response, result } = await rpc(
      c,
      '/web/session/authenticate',
      { db: c.database, login, password },
      null,
    );
    session = /\bsession_id=([A-Za-z0-9_-]{32,128});/.exec(response.headers.get('set-cookie') || '')?.[1];
    if (!isObject(result) || !Number.isSafeInteger(result.uid) || Number(result.uid) <= 0 || !session) {
      throw new Error();
    }
  } catch {
    throw new HubError('SIGN_IN_FAILED_OR_MFA_REQUIRED', 401);
  }
  const context = await rpc(c, '/companion/hub/action', { siteId: c.siteId, operation: 'context', payload: {} }, session).catch(
    () => null,
  );
  const role = isObject(context?.result) && isObject(context.result.principal) ? context.result.principal.role : null;
  if (!context || !isObject(context.result) || context.result.error || !isHubRole(role)) {
    await rpc(c, '/web/session/destroy', {}, session, 5000).catch(() => undefined);
    throw new HubError('NO_SITE_ACCESS', 403);
  }
  return { session, role, context: context.result };
}

/** Ends the Odoo session. Returns whether Odoo confirmed it. */
export async function disconnectHub(c: Config, session: string) {
  try {
    await rpc(c, '/web/session/destroy', {}, session, 5000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs one hub operation as the connected staff member. A write whose result
 * Odoo did not clearly confirm becomes BACKEND_UNAVAILABLE_RETRY_SAME_ACTION:
 * the caller must retry with the same requestKey, never submit a new action.
 */
export async function runHub(
  c: Config,
  session: string,
  operation: string,
  payload: Record<string, unknown>,
  requestKey: string | undefined,
): Promise<Record<string, unknown>> {
  if (!isHubOperation(operation)) throw new HubError('INVALID_COMMAND', 400);
  if (!READS.has(operation) && (typeof requestKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{15,127}$/.test(requestKey))) {
    throw new HubError('INVALID_COMMAND', 400);
  }

  let result: unknown;
  try {
    ({ result } = await rpc(
      c,
      LARGE.has(operation) ? '/companion/hub/photo' : '/companion/hub/action',
      { siteId: c.siteId, operation, payload, requestKey },
      session,
    ));
  } catch (error) {
    if (error instanceof HubError) throw error;
    throw new HubError('BACKEND_UNAVAILABLE_RETRY_SAME_ACTION', 503);
  }
  if (!isObject(result)) throw new HubError('BACKEND_UNAVAILABLE_RETRY_SAME_ACTION', 503);
  if (isObject(result.error)) {
    const status = [400, 401, 403, 404, 409, 422, 503].includes(Number(result.error.status)) ? Number(result.error.status) : 503;
    const code = typeof result.error.code === 'string' && /^[A-Z_]{1,80}$/.test(result.error.code) ? result.error.code : 'BACKEND_UNAVAILABLE';
    throw new HubError(code, status);
  }

  const unconfirmed = () => new HubError('BACKEND_UNAVAILABLE_RETRY_SAME_ACTION', 503);

  if (SHIFT_WRITES.has(operation)) {
    if (!shiftMatches(operation, payload, result)) throw unconfirmed();
  } else if (operation === 'create_student') {
    if (
      result.state !== 'student_created' ||
      typeof result.memberId !== 'string' ||
      !/^[1-9][0-9]{0,9}$/.test(result.memberId) ||
      typeof result.memberNumber !== 'string' ||
      !result.memberNumber ||
      typeof result.replayed !== 'boolean' ||
      result.subscriptionCreated !== false ||
      result.enrollmentCreated !== false ||
      result.portalAccessGranted !== false ||
      result.messageSent !== false
    ) {
      throw unconfirmed();
    }
  } else if (WRITE_STATES[operation]) {
    if (!WRITE_STATES[operation].includes(String(result.state)) || typeof result.replayed !== 'boolean') throw unconfirmed();
    if (!writeMatches(operation, payload, result)) throw unconfirmed();
  }

  if (operation === 'payment_link') checkPaymentLink(c, payload, result);
  return result;
}

/** A clock or correction receipt names the exact native shift, open or closed as expected. */
function shiftMatches(op: string, p: Record<string, unknown>, r: Record<string, unknown>) {
  const shift = r.shift;
  const expected = op === 'correct_timesheet' ? 'timesheet_corrected' : p.direction === 'in' ? 'clocked_in' : 'clocked_out';
  const isTime = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  if (r.state !== expected || !isObject(shift) || typeof shift.id !== 'string' || !/^[1-9][0-9]*$/.test(shift.id)) return false;
  if (!isTime(shift.checkIn)) return false;
  if (expected === 'clocked_in' ? shift.checkOut !== null : !isTime(shift.checkOut)) return false;
  if (op === 'correct_timesheet' && shift.id !== p.shiftId) return false;
  if (op === 'instructor_clock' && p.direction === 'out' && shift.id !== p.currentShiftId) return false;
  return true;
}

/** The write's receipt names the same record the request asked about, and claims no side effect it must not have. */
function writeMatches(op: string, p: Record<string, unknown>, r: Record<string, unknown>) {
  if (TESTING_WRITES.has(op)) {
    return (
      typeof r.testId === 'string' &&
      (p.testId === null || r.testId === p.testId) &&
      (op !== 'promote_test_results' || (r.messageSent === false && r.invoiceCreated === false))
    );
  }
  if (op === 'reverse_promotion') return r.rankHistoryId === p.rankHistoryId;
  if (REFUND_WRITES.has(op)) {
    // Money only counts as returned once staff record the refund payment.
    return (
      typeof r.refundId === 'string' &&
      (op === 'request_refund' ? r.memberId === p.memberId : r.refundId === p.refundId) &&
      r.moneyReturned === (op === 'record_refund_payment')
    );
  }
  if (BROADCAST_WRITES.has(op)) {
    return (
      typeof r.broadcastId === 'string' &&
      (op === 'create_broadcast' || r.broadcastId === p.broadcastId) &&
      r.messageSent === false
    );
  }
  if (op === 'set_automation_active') {
    return r.automationId === p.automationId && r.state === (p.active ? 'automation_resumed' : 'automation_paused');
  }
  if (PIN_WRITES.has(op)) {
    // The PIN must never come back in the receipt.
    return (
      r.memberId === p.memberId &&
      r.guardianId === p.guardianId &&
      r.messageSent === false &&
      !JSON.stringify(r).includes(String(p.pin ?? '\u0000'))
    );
  }
  if (op === 'assign_course_members') return r.templateId === p.templateId;
  if (op === 'sign_waiver') {
    return r.memberId === p.memberId && r.messageSent === false && !JSON.stringify(r).includes('base64');
  }
  if (op === 'record_consent') {
    return r.memberId === p.memberId && r.partnerId === p.partnerId && r.consent === p.state && r.messageSent === false;
  }
  if (TRIAL_WRITES.has(op)) {
    const subject =
      op === 'reserve_trial'
        ? r.leadId === p.leadId && r.memberId === p.memberId && r.sessionId === p.sessionId
        : r.trialId === p.trialId;
    return subject && r.messageSent === false && r.stageChanged !== true && r.paymentCollected !== true && r.portalAccessGranted !== true;
  }
  return r.memberId === p.memberId && (op !== 'mark_attendance' || (r.sessionId === p.sessionId && r.after === p.status));
}

/** Only the configured Odoo's checkout page for this exact invoice is trusted. */
function checkPaymentLink(c: Config, p: Record<string, unknown>, r: Record<string, unknown>) {
  const invalid = new HubError('PAYMENT_RESPONSE_INVALID', 502);
  if (
    typeof r.checkoutUrl !== 'string' ||
    typeof r.invoiceId !== 'string' ||
    r.invoiceId !== p.invoiceId ||
    r.memberId !== p.memberId ||
    typeof r.amount !== 'number' ||
    !Number.isFinite(r.amount) ||
    r.amount <= 0 ||
    r.amount !== p.expectedAmount ||
    typeof r.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(r.currency)
  ) {
    throw invalid;
  }
  let checkout: URL;
  try {
    checkout = new URL(r.checkoutUrl);
  } catch {
    throw invalid;
  }
  checkout.pathname = checkout.pathname.replace(/^\/+/, '/');
  if (
    checkout.origin !== c.backend ||
    checkout.username ||
    checkout.password ||
    checkout.pathname !== `/my/invoices/${r.invoiceId}` ||
    !checkout.searchParams.get('access_token') ||
    checkout.searchParams.get('move_id') !== r.invoiceId ||
    !checkout.searchParams.get('payment_token')
  ) {
    throw invalid;
  }
  r.checkoutUrl = checkout.href;
}
