import { fromOdooDatetime, m2oName, searchRead, type Many2one } from '@/lib/odoo';

/**
 * Member 360 (§15): one member's full picture, read from Odoo. Named fields
 * only — dojo.member's medical fields (allergies, medical_notes, blood_type,
 * emergency_note) and date of birth are never requested.
 */

export type AttendanceEntry = { id: number; at: string; session: string | null; sessionId: number | null; status: string; late: boolean };
export type RankEntry = { id: number; rank: string | null; program: string | null; awardedOn: string; stripes: number; awardedBy: string | null };
export type TestEntry = { id: number; test: string | null; target: string | null; result: string | null };
export type ProgramEntry = { id: number; program: string | null; active: boolean; enrolledOn: string | null };
export type SubscriptionEntry = {
  id: number;
  name: string;
  plan: string | null;
  state: string | null;
  paused: boolean;
  amount: number;
  currency: string | null;
  startedOn: string | null;
  nextBilling: string | null;
};
export type InvoiceEntry = {
  id: number;
  number: string;
  date: string | null;
  due: string | null;
  total: number;
  outstanding: number;
  currency: string | null;
  state: string;
  paymentState: string;
};
export type EmergencyContact = { id: number; name: string; relationship: string; phone: string; email: string | null; primary: boolean };

export type Member360 = {
  id: number;
  name: string;
  memberNumber: string | null;
  membershipState: string;
  rank: string | null;
  stripes: number;
  attendanceRate: number;
  totalSessions: number;
  sinceLastRank: number;
  rankThreshold: number | null;
  testInvitePending: boolean;
  minor: boolean;
  guardian: string | null;
  phone: string | null;
  email: string | null;
  joinedOn: string;
  waiverState: string | null;
  waiverSignedOn: string | null;
  primaryInstructor: string | null;
  attendance: AttendanceEntry[];
  ranks: RankEntry[];
  tests: TestEntry[];
  programs: ProgramEntry[];
  subscriptions: SubscriptionEntry[];
  invoices: InvoiceEntry[];
  emergencyContacts: EmergencyContact[];
};

type MemberRow = {
  id: number;
  name: string;
  member_number: string | false;
  membership_state: string;
  current_rank_id: Many2one;
  current_stripe_count: number;
  attendance_rate: number;
  total_sessions: number;
  attendance_since_last_rank: number;
  test_invite_pending: boolean;
  is_minor: boolean;
  primary_guardian_id: Many2one;
  partner_id: Many2one;
  phone: string | false;
  email: string | false;
  create_date: string;
  waiver_state: string | false;
  waiver_signed_on: string | false;
};

const day = (value: string | false) => (value ? value : null);

export const attended = (status: string) => status === 'present' || status === 'late';

/**
 * Odoo's absence reasons include sick and injury — health information (§50).
 * Staff screens show every non-attendance reason other than "absent" as excused.
 */
export function attendanceLabel(status: string): 'present' | 'late' | 'absent' | 'excused' {
  return status === 'present' || status === 'late' || status === 'absent' ? status : 'excused';
}

export async function loadMember360(memberId: number): Promise<Member360 | null> {
  const [m] = await searchRead<MemberRow>(
    'dojo.member',
    [['id', '=', memberId]],
    [
      'name',
      'member_number',
      'membership_state',
      'current_rank_id',
      'current_stripe_count',
      'attendance_rate',
      'total_sessions',
      'attendance_since_last_rank',
      'test_invite_pending',
      'is_minor',
      'primary_guardian_id',
      'partner_id',
      'phone',
      'email',
      'create_date',
      'waiver_state',
      'waiver_signed_on',
    ],
    { limit: 1 },
  );
  if (!m) return null;

  // Invoices may be billed to the member or to their guardian (household).
  const billedPartners = [m.partner_id, m.primary_guardian_id].filter(Boolean).map((p) => (p as [number, string])[0]);

  const [threshold, logs, ranks, tests, programs, subscriptions, invoices, contacts] = await Promise.all([
    m.current_rank_id
      ? searchRead<{ attendance_threshold: number }>('dojo.belt.rank', [['id', '=', m.current_rank_id[0]]], ['attendance_threshold'], {
          limit: 1,
        }).then((rows) => rows[0]?.attendance_threshold || null)
      : null,
    searchRead<{ id: number; session_id: Many2one; status: string; checkin_datetime: string; is_late: boolean }>(
      'dojo.attendance.log',
      [['member_id', '=', memberId]],
      ['session_id', 'status', 'checkin_datetime', 'is_late'],
      { order: 'checkin_datetime desc', limit: 50 },
    ),
    searchRead<{ id: number; rank_id: Many2one; program_id: Many2one; date_awarded: string; stripe_count: number; awarded_by: Many2one }>(
      'dojo.member.rank',
      [['member_id', '=', memberId]],
      ['rank_id', 'program_id', 'date_awarded', 'stripe_count', 'awarded_by'],
      { order: 'date_awarded desc', limit: 30 },
    ),
    searchRead<{ id: number; test_id: Many2one; target_rank_id: Many2one; result: string | false }>(
      'dojo.belt.test.registration',
      [['member_id', '=', memberId]],
      ['test_id', 'target_rank_id', 'result'],
      { order: 'id desc', limit: 20 },
    ),
    searchRead<{ id: number; program_id: Many2one; is_active: boolean; enrolled_date: string | false }>(
      'dojo.program.enrollment',
      [['member_id', '=', memberId]],
      ['program_id', 'is_active', 'enrolled_date'],
      { order: 'is_active desc, enrolled_date desc', limit: 20 },
    ),
    searchRead<{
      id: number;
      name: string;
      plan_id: Many2one;
      state: string | false;
      paused: boolean;
      recurring_total: number;
      currency_id: Many2one;
      date_start: string | false;
      recurring_next_date: string | false;
    }>(
      'sale.subscription',
      [['member_id', '=', memberId]],
      ['name', 'plan_id', 'state', 'paused', 'recurring_total', 'currency_id', 'date_start', 'recurring_next_date'],
      { order: 'date_start desc', limit: 20 },
    ),
    billedPartners.length
      ? searchRead<{
          id: number;
          name: string | false;
          invoice_date: string | false;
          invoice_date_due: string | false;
          amount_total: number;
          amount_residual: number;
          currency_id: Many2one;
          state: string;
          payment_state: string;
        }>(
          'account.move',
          [
            ['move_type', '=', 'out_invoice'],
            ['partner_id', 'in', billedPartners],
          ],
          ['name', 'invoice_date', 'invoice_date_due', 'amount_total', 'amount_residual', 'currency_id', 'state', 'payment_state'],
          { order: 'invoice_date desc, id desc', limit: 20 },
        ).catch(() => []) // accounting can be restricted for the API user
      : [],
    searchRead<{ id: number; name: string; relationship: string; phone: string; email: string | false; is_primary: boolean }>(
      'dojo.emergency.contact',
      [['member_id', '=', memberId]],
      ['name', 'relationship', 'phone', 'email', 'is_primary'],
      { order: 'is_primary desc, id asc', limit: 10 },
    ),
  ]);

  // Primary instructor: whoever taught most of their recent attended classes.
  const attendedSessionIds = [
    ...new Set(logs.filter((l) => l.session_id && attended(l.status)).map((l) => (l.session_id as [number, string])[0])),
  ].slice(0, 20);
  const sessions = attendedSessionIds.length
    ? await searchRead<{ id: number; instructor_profile_id: Many2one }>(
        'dojo.class.session',
        [['id', 'in', attendedSessionIds]],
        ['instructor_profile_id'],
        { limit: attendedSessionIds.length },
      )
    : [];
  const tally = new Map<string, number>();
  for (const s of sessions) {
    const name = m2oName(s.instructor_profile_id);
    if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  const primaryInstructor = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    id: m.id,
    name: m.name,
    memberNumber: m.member_number || null,
    membershipState: m.membership_state,
    rank: m2oName(m.current_rank_id),
    stripes: m.current_stripe_count,
    attendanceRate: m.attendance_rate,
    totalSessions: m.total_sessions,
    sinceLastRank: m.attendance_since_last_rank,
    rankThreshold: threshold,
    testInvitePending: m.test_invite_pending,
    minor: m.is_minor,
    guardian: m2oName(m.primary_guardian_id),
    phone: m.phone || null,
    email: m.email || null,
    joinedOn: fromOdooDatetime(m.create_date).toISOString(),
    waiverState: m.waiver_state || null,
    waiverSignedOn: m.waiver_signed_on ? fromOdooDatetime(m.waiver_signed_on).toISOString() : null,
    primaryInstructor,
    attendance: logs.map((l) => ({
      id: l.id,
      at: fromOdooDatetime(l.checkin_datetime).toISOString(),
      session: m2oName(l.session_id),
      sessionId: l.session_id ? l.session_id[0] : null,
      status: l.status,
      late: l.is_late,
    })),
    ranks: ranks.map((r) => ({
      id: r.id,
      rank: m2oName(r.rank_id),
      program: m2oName(r.program_id),
      awardedOn: r.date_awarded,
      stripes: r.stripe_count,
      awardedBy: m2oName(r.awarded_by),
    })),
    tests: tests.map((t) => ({ id: t.id, test: m2oName(t.test_id), target: m2oName(t.target_rank_id), result: t.result || null })),
    programs: programs.map((p) => ({ id: p.id, program: m2oName(p.program_id), active: p.is_active, enrolledOn: day(p.enrolled_date) })),
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      name: s.name,
      plan: m2oName(s.plan_id),
      state: s.state || null,
      paused: s.paused,
      amount: s.recurring_total,
      currency: m2oName(s.currency_id),
      startedOn: day(s.date_start),
      nextBilling: day(s.recurring_next_date),
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.name && i.name !== '/' ? i.name : '—',
      date: day(i.invoice_date),
      due: day(i.invoice_date_due),
      total: i.amount_total,
      outstanding: i.amount_residual,
      currency: m2oName(i.currency_id),
      state: i.state,
      paymentState: i.payment_state,
    })),
    emergencyContacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      relationship: c.relationship,
      phone: c.phone,
      email: c.email || null,
      primary: c.is_primary,
    })),
  };
}

export type Insight = {
  engagement: 'healthy' | 'fair' | 'low' | 'unknown';
  retentionRisk: 'low' | 'medium' | 'high' | 'unknown';
  daysSinceClass: number | null;
  testingReadiness: number | null;
  suggestion: 'testInvite' | 'promotionReview' | 'reachOut' | 'signWaiver' | null;
};

/**
 * Member intelligence, rule-based for now (no model call): engagement from
 * attendance rate, retention risk from days since the last class, testing
 * readiness from classes since last rank against the rank's threshold.
 */
export function memberInsight(m: Member360, now = new Date()): Insight {
  const last = m.attendance.find((a) => attended(a.status));
  const daysSinceClass = last ? Math.floor((now.getTime() - new Date(last.at).getTime()) / 86_400_000) : null;
  const engagement = !m.totalSessions ? 'unknown' : m.attendanceRate >= 75 ? 'healthy' : m.attendanceRate >= 50 ? 'fair' : 'low';
  const retentionRisk = daysSinceClass === null ? 'unknown' : daysSinceClass < 14 ? 'low' : daysSinceClass < 30 ? 'medium' : 'high';
  const testingReadiness = m.rankThreshold ? Math.min(100, Math.round((m.sinceLastRank / m.rankThreshold) * 100)) : null;
  const suggestion = m.testInvitePending
    ? 'testInvite'
    : testingReadiness === 100
      ? 'promotionReview'
      : retentionRisk === 'high' && m.membershipState === 'active'
        ? 'reachOut'
        : m.waiverState && m.waiverState !== 'signed'
          ? 'signWaiver'
          : null;
  return { engagement, retentionRisk, daysSinceClass, testingReadiness, suggestion };
}
