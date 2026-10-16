import { fromOdooDatetime, m2oName, searchCount, searchRead, toOdooDatetime, type Many2one } from '@/lib/odoo';

/**
 * Academy reads from Odoo (dojo_core): today's classes, a class's arrivals
 * and a member's context card. Read-only — check-in stays with Odoo's kiosk
 * flow, which owns eligibility, locking and the attendance outbox event.
 */

export type AcademyClass = {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  booked: number;
  present: number;
  instructor: string | null;
  done: boolean;
};

export type Arrival = { memberId: number; name: string; checkedIn: boolean };

export type MemberCard = {
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
  lastAttendance: { at: string; session: string | null } | null;
  minor: boolean;
  guardian: string | null;
};

type SessionRow = {
  id: number;
  name: string;
  start_datetime: string;
  end_datetime: string;
  capacity: number;
  seats_taken: number;
  present_count: number;
  instructor_profile_id: Many2one;
  state: string;
};

export async function loadTodayClasses(dayStart: Date, dayEnd: Date): Promise<AcademyClass[]> {
  const rows = await searchRead<SessionRow>(
    'dojo.class.session',
    [
      ['start_datetime', '>=', toOdooDatetime(dayStart)],
      ['start_datetime', '<', toOdooDatetime(dayEnd)],
      ['state', 'in', ['open', 'done']],
    ],
    ['name', 'start_datetime', 'end_datetime', 'capacity', 'seats_taken', 'present_count', 'instructor_profile_id', 'state'],
    { order: 'start_datetime asc', limit: 30 },
  );
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    startsAt: fromOdooDatetime(s.start_datetime).toISOString(),
    endsAt: fromOdooDatetime(s.end_datetime).toISOString(),
    capacity: s.capacity,
    booked: s.seats_taken,
    present: s.present_count,
    instructor: m2oName(s.instructor_profile_id),
    done: s.state === 'done',
  }));
}

/** Registered members of one class; checked in once the kiosk marks them present. */
export async function loadArrivals(sessionId: number): Promise<Arrival[]> {
  const rows = await searchRead<{ member_id: Many2one; attendance_state: string }>(
    'dojo.class.enrollment',
    [
      ['session_id', '=', sessionId],
      ['status', '=', 'registered'],
    ],
    ['member_id', 'attendance_state'],
    { limit: 100 },
  );
  return rows
    .filter((e) => e.member_id)
    .map((e) => ({
      memberId: (e.member_id as [number, string])[0],
      name: (e.member_id as [number, string])[1],
      checkedIn: e.attendance_state === 'present',
    }))
    // Not here yet first (§10: keep not-yet-arrived people at the top).
    .sort((a, b) => Number(a.checkedIn) - Number(b.checkedIn) || a.name.localeCompare(b.name));
}

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
  is_minor: boolean;
  primary_guardian_id: Many2one;
};

export async function loadMemberCard(memberId: number): Promise<MemberCard | null> {
  // Named fields only — the member's medical fields are never requested.
  const [member] = await searchRead<MemberRow>(
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
      'is_minor',
      'primary_guardian_id',
    ],
    { limit: 1 },
  );
  if (!member) return null;

  const [rank, lastLog] = await Promise.all([
    member.current_rank_id
      ? searchRead<{ attendance_threshold: number }>('dojo.belt.rank', [['id', '=', member.current_rank_id[0]]], ['attendance_threshold'], {
          limit: 1,
        }).then((rows) => rows[0] ?? null)
      : null,
    searchRead<{ checkin_datetime: string; session_id: Many2one }>(
      'dojo.attendance.log',
      [
        ['member_id', '=', memberId],
        ['status', 'in', ['present', 'late']],
      ],
      ['checkin_datetime', 'session_id'],
      { order: 'checkin_datetime desc', limit: 1 },
    ).then((rows) => rows[0] ?? null),
  ]);

  return {
    id: member.id,
    name: member.name,
    memberNumber: member.member_number || null,
    membershipState: member.membership_state,
    rank: m2oName(member.current_rank_id),
    stripes: member.current_stripe_count,
    attendanceRate: member.attendance_rate,
    totalSessions: member.total_sessions,
    sinceLastRank: member.attendance_since_last_rank,
    rankThreshold: rank?.attendance_threshold || null,
    lastAttendance: lastLog
      ? { at: fromOdooDatetime(lastLog.checkin_datetime).toISOString(), session: m2oName(lastLog.session_id) }
      : null,
    minor: member.is_minor,
    guardian: m2oName(member.primary_guardian_id),
  };
}

export const MEMBERSHIP_STATES = ['lead', 'trial', 'active', 'paused', 'cancelled'] as const;

export type MemberRowSummary = {
  id: number;
  name: string;
  memberNumber: string | null;
  membershipState: string;
  rank: string | null;
  stripes: number;
  attendanceRate: number;
  phone: string | null;
  email: string | null;
  minor: boolean;
  guardian: string | null;
};

type MemberListRow = {
  id: number;
  name: string;
  member_number: string | false;
  membership_state: string;
  current_rank_id: Many2one;
  current_stripe_count: number;
  attendance_rate: number;
  phone: string | false;
  email: string | false;
  is_minor: boolean;
  primary_guardian_id: Many2one;
};

/** One page of members, searchable by name, member number, phone or email. */
export async function loadMembers({
  q,
  state,
  page,
  limit = 25,
}: {
  q?: string;
  state?: string;
  page: number;
  limit?: number;
}): Promise<{ members: MemberRowSummary[]; total: number; pages: number }> {
  const domain: unknown[] = [];
  if (state && (MEMBERSHIP_STATES as readonly string[]).includes(state)) domain.push(['membership_state', '=', state]);
  if (q) {
    domain.push('|', '|', '|', ['name', 'ilike', q], ['member_number', 'ilike', q], ['phone', 'ilike', q], ['email', 'ilike', q]);
  }

  // Named fields only — the member's medical fields are never requested.
  const [total, rows] = await Promise.all([
    searchCount('dojo.member', domain),
    searchRead<MemberListRow>(
      'dojo.member',
      domain,
      [
        'name',
        'member_number',
        'membership_state',
        'current_rank_id',
        'current_stripe_count',
        'attendance_rate',
        'phone',
        'email',
        'is_minor',
        'primary_guardian_id',
      ],
      { order: 'name asc', limit, offset: (page - 1) * limit },
    ),
  ]);

  return {
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    members: rows.map((m) => ({
      id: m.id,
      name: m.name,
      memberNumber: m.member_number || null,
      membershipState: m.membership_state,
      rank: m2oName(m.current_rank_id),
      stripes: m.current_stripe_count,
      attendanceRate: m.attendance_rate,
      phone: m.phone || null,
      email: m.email || null,
      minor: m.is_minor,
      guardian: m2oName(m.primary_guardian_id),
    })),
  };
}

export type SessionSummary = AcademyClass & { template: string; state: string };

type SessionListRow = SessionRow & { template_id: Many2one; end_datetime: string };

/** Sessions in a window, any state but draft — the Classes page's schedule. */
export async function loadSessions(from: Date, to: Date): Promise<SessionSummary[]> {
  const rows = await searchRead<SessionListRow>(
    'dojo.class.session',
    [
      ['start_datetime', '>=', toOdooDatetime(from)],
      ['start_datetime', '<', toOdooDatetime(to)],
      ['state', '!=', 'draft'],
    ],
    ['name', 'template_id', 'start_datetime', 'end_datetime', 'capacity', 'seats_taken', 'present_count', 'instructor_profile_id', 'state'],
    { order: 'start_datetime asc', limit: 200 },
  );
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    template: m2oName(s.template_id) ?? s.name,
    startsAt: fromOdooDatetime(s.start_datetime).toISOString(),
    endsAt: fromOdooDatetime(s.end_datetime).toISOString(),
    capacity: s.capacity,
    booked: s.seats_taken,
    present: s.present_count,
    instructor: m2oName(s.instructor_profile_id),
    done: s.state === 'done',
    state: s.state,
  }));
}

export type RosterEntry = { memberId: number; name: string; attendance: string; waitlist: boolean };

/** Everyone booked into a session (registered + waitlist), with attendance state. */
export async function loadSessionRoster(sessionId: number): Promise<RosterEntry[]> {
  const rows = await searchRead<{ member_id: Many2one; attendance_state: string; status: string }>(
    'dojo.class.enrollment',
    [
      ['session_id', '=', sessionId],
      ['status', 'in', ['registered', 'waitlist']],
    ],
    ['member_id', 'attendance_state', 'status'],
    { limit: 200 },
  );
  return rows
    .filter((e) => e.member_id)
    .map((e) => ({
      memberId: (e.member_id as [number, string])[0],
      name: (e.member_id as [number, string])[1],
      attendance: e.attendance_state,
      waitlist: e.status === 'waitlist',
    }))
    .sort((a, b) => Number(a.waitlist) - Number(b.waitlist) || a.name.localeCompare(b.name));
}

export type LessonPlan = { template: string; level: string | null; description: string | null; durationMinutes: number };

/** The class template behind a session: level and description (the lesson plan until Odoo has one). */
export async function loadLessonPlan(sessionId: number): Promise<LessonPlan | null> {
  const [session] = await searchRead<{ template_id: Many2one }>('dojo.class.session', [['id', '=', sessionId]], ['template_id'], {
    limit: 1,
  });
  if (!session?.template_id) return null;
  const [template] = await searchRead<{ name: string; level: string | false; description: string | false; duration_minutes: number }>(
    'dojo.class.template',
    [['id', '=', session.template_id[0]]],
    ['name', 'level', 'description', 'duration_minutes'],
    { limit: 1 },
  );
  if (!template) return null;
  return {
    template: template.name,
    level: template.level || null,
    description: template.description || null,
    durationMinutes: template.duration_minutes,
  };
}

export type Pulse = {
  byState: Record<string, number>;
  avgAttendance: number | null;
  todayBooked: number;
  todayCapacity: number;
  todayPresent: number;
  todayClasses: number;
};

/** Business Pulse (§30) from Odoo: members by state, attendance, today's fill. */
export async function loadPulse(dayStart: Date, dayEnd: Date): Promise<Pulse> {
  const [counts, active, today] = await Promise.all([
    Promise.all(MEMBERSHIP_STATES.map((s) => searchCount('dojo.member', [['membership_state', '=', s]]))),
    searchRead<{ attendance_rate: number }>('dojo.member', [['membership_state', '=', 'active']], ['attendance_rate'], { limit: 2000 }),
    loadTodayClasses(dayStart, dayEnd),
  ]);
  return {
    byState: Object.fromEntries(MEMBERSHIP_STATES.map((s, i) => [s, counts[i]])),
    avgAttendance: active.length ? active.reduce((sum, m) => sum + m.attendance_rate, 0) / active.length : null,
    todayBooked: today.reduce((sum, c) => sum + c.booked, 0),
    todayCapacity: today.reduce((sum, c) => sum + c.capacity, 0),
    todayPresent: today.reduce((sum, c) => sum + c.present, 0),
    todayClasses: today.length,
  };
}
