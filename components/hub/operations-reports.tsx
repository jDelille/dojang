'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Select, Table, Td, Th, Tr } from '@/components/ui';
import { PANEL, Stat } from '@/components/odoo/shared';
import { HubGate, Notice, useHubMe, useHubRead } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/** Ported from Jodi's OperationsWorkspace. Read-only: nothing here changes attendance, memberships or payroll. */

type ReportClass = { id: string; name: string; startsAt: string };
type Report = {
  fromDate: string;
  toDate: string;
  timeZone: string;
  generatedAt: string;
  sessions: number;
  classes: ReportClass[];
  attendance: { recorded: number; attended: number; daily: { date: string; counts: Record<string, number> }[] };
  workload: { id: string; name: string; sessions: number; scheduledHours: number; closedShiftHours: number; openShifts: number }[];
  unassignedSessions: number;
  beltDistribution: { name: string; members: number }[];
  family: { households: number; membersInHouseholds: number; membersWithoutHousehold: number };
  scope: string;
};
type Roster = {
  session: { id: string; name: string; startsAt: string; endsAt: string; instructor: string | null; state: string };
  timeZone: string;
  generatedAt: string;
  members: { id: string; name: string; rank: string; attendance: string }[];
};
type Upcoming = { sessions: { id: string; title: string; startsAt: string }[] };

const TEXT = 'text-[13px]';
const ATTENDANCE_LABELS: Record<string, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
  sick: 'Sick',
  injury: 'Injury',
  vacation: 'Vacation',
  other: 'Other',
  pending: 'Not yet recorded',
};

/** Jodi's wording for this screen's read errors. */
function errorText(code: string) {
  if (code === 'REPORT_TOO_LARGE') return 'This report exceeds the safe display limit. Use a smaller date range or the native Odoo report.';
  if (code === 'INVALID_REPORT_RANGE') return 'Choose a valid date range of at most 31 days.';
  return 'Authorized records could not be loaded. Retry or sign in again; no sample records are substituted.';
}

function inZone(value: string, timeZone: string) {
  return new Date(value).toLocaleString(undefined, { timeZone });
}

export function OperationsReports() {
  return (
    <HubGate capability="reports.read">
      <OperationsScreen />
    </HubGate>
  );
}

function OperationsScreen() {
  const me = useHubMe();
  const manager = me.role === 'owner' || me.role === 'manager';
  const [reportPath, setReportPath] = useState<string | null>(null);
  const report = useHubRead<Report>(manager ? reportPath : null);
  const upcoming = useHubRead<Upcoming>('classes/upcoming');
  const [sessionId, setSessionId] = useState('');
  const roster = useHubRead<Roster>(sessionId ? `sessions/${sessionId}/roster` : null);

  function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams({ fromDate: String(form.get('fromDate')), toDate: String(form.get('toDate')) });
    const path = `reports/operations?${query}`;
    if (path === reportPath) void report.reload().catch(() => undefined);
    else setReportPath(path);
  }

  // Classes to pick a roster from: upcoming ones, plus past ones from a loaded report.
  const reportData = report.data && Array.isArray(report.data.classes) ? report.data : null;
  const timeZone = reportData?.timeZone || 'UTC';
  const classes = new Map<string, ReportClass>();
  for (const s of upcoming.data?.sessions ?? []) classes.set(s.id, { id: s.id, name: s.title, startsAt: s.startsAt });
  for (const s of reportData?.classes ?? []) classes.set(s.id, s);
  const rosterData = roster.data && Array.isArray(roster.data.members) && !roster.error ? roster.data : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className={cn(TEXT, 'muted')}>Read-only Odoo records. No attendance, memberships or payroll are changed here.</p>

      <section className={cn(PANEL, 'space-y-3 print:hidden')} aria-label="Operations report">
        <p className="eyebrow">Operations report</p>
        {manager ? (
          <>
            <form className="flex flex-wrap items-end gap-2" onSubmit={run}>
              <Field label="From date">
                <Input name="fromDate" type="date" required />
              </Field>
              <Field label="Through date">
                <Input name="toDate" type="date" required />
              </Field>
              <Button type="submit" disabled={report.loading}>
                Load operations report
              </Button>
            </form>
            <p className="text-[12px] muted">Up to 31 days, using your school’s timezone. No missing attendance is inferred as an absence.</p>
            {report.loading && <Notice>Loading native operations records…</Notice>}
            {report.error && !report.loading && <Notice tone="alert">{errorText(report.error)}</Notice>}
            {reportData && !report.loading && !report.error && <ReportView report={reportData} />}
          </>
        ) : (
          <p className={TEXT}>School-wide reports require manager or owner access. Your authorized class rosters remain available below.</p>
        )}
      </section>

      <section className={cn(PANEL, 'space-y-3')} aria-label="Class roster">
        <div className="space-y-3 print:hidden">
          <p className="eyebrow">Class roster</p>
          <Field label="Class">
            <Select aria-label="Roster class" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
              <option value="">Choose an authorized class</option>
              {[...classes.values()].map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {inZone(s.startsAt, timeZone)} {timeZone}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-[12px] muted">
            Managers can load a report date range to select past classes. This is the current registered roster, not a saved testing roster.
          </p>
          {upcoming.error && <Notice tone="alert">{errorText(upcoming.error)}</Notice>}
          {roster.loading && <Notice>Loading the actual class roster…</Notice>}
          {roster.error && !roster.loading && (
            <Notice tone="alert">
              {errorText(roster.error)}{' '}
              <button type="button" className="font-semibold underline" onClick={() => void roster.reload().catch(() => undefined)}>
                Retry roster
              </button>
            </Notice>
          )}
          {rosterData && !roster.loading && (
            <Button size="sm" onClick={() => window.print()}>
              Print class roster
            </Button>
          )}
        </div>

        {rosterData && !roster.loading && (
          <article className="hub-printable space-y-2" aria-label="Printable class roster">
            <h2 className="text-lg font-bold">{rosterData.session.name}</h2>
            <p className={TEXT}>
              {inZone(rosterData.session.startsAt, rosterData.timeZone)} · {rosterData.timeZone} · {rosterData.session.instructor || 'Instructor not assigned'} ·{' '}
              {rosterData.session.state}
            </p>
            <p className="text-[12px] muted">
              {rosterData.members.length} registered members · Generated {new Date(rosterData.generatedAt).toLocaleString()} · Staff-only copy
            </p>
            {rosterData.members.length ? (
              <Table caption="Class roster" minWidth={420}>
                <thead>
                  <tr>
                    <Th>Student</Th>
                    <Th>Current belt</Th>
                    <Th>Recorded attendance</Th>
                  </tr>
                </thead>
                <tbody>
                  {rosterData.members.map((member) => (
                    <Tr key={member.id}>
                      <Td>{member.name}</Td>
                      <Td>{member.rank}</Td>
                      <Td>{ATTENDANCE_LABELS[member.attendance] || member.attendance}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className={TEXT}>No registered members on this class roster.</p>
            )}
          </article>
        )}
      </section>
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  return (
    <div className="space-y-4 border-t border-[color:var(--color-border)] pt-3" aria-label="Verified operations report">
      <div>
        <h3 className="font-semibold">
          {report.fromDate} — {report.toDate}
        </h3>
        <p className="text-[12px] muted">
          {report.scope} Timezone: {report.timeZone}.
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Scheduled classes" value={String(report.sessions)} />
        <Stat label="Attended records" value={String(report.attendance.attended)} />
        <Stat label="Recorded outcomes" value={String(report.attendance.recorded)} />
      </dl>

      <div className="space-y-1">
        <h3 className="font-semibold">Daily attendance</h3>
        {report.attendance.daily.length ? (
          report.attendance.daily.map((day) => (
            <p key={day.date} className={TEXT}>
              <strong>{day.date}</strong> ·{' '}
              {Object.entries(day.counts)
                .map(([state, count]) => `${ATTENDANCE_LABELS[state] || state}: ${count}`)
                .join(' · ')}
            </p>
          ))
        ) : (
          <p className={TEXT}>No recorded attendance in this class-date range.</p>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold">Instructor workload</h3>
        {report.workload.length ? (
          <Table caption="Instructor workload" minWidth={520}>
            <thead>
              <tr>
                <Th>Instructor</Th>
                <Th align="right">Classes</Th>
                <Th align="right">Scheduled hours</Th>
                <Th align="right">Closed-shift hours</Th>
                <Th align="right">Open shifts</Th>
              </tr>
            </thead>
            <tbody>
              {report.workload.map((row) => (
                <Tr key={row.id}>
                  <Td>{row.name}</Td>
                  <Td align="right">{row.sessions}</Td>
                  <Td align="right">{row.scheduledHours.toFixed(2)}</Td>
                  <Td align="right">{row.closedShiftHours.toFixed(2)}</Td>
                  <Td align="right">{row.openShifts}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className={TEXT}>No linked instructor activity in this range.</p>
        )}
        <p className="text-[12px] muted">
          {report.unassignedSessions} classes have no instructor assigned. Scheduled hours and worked shift hours measure different records; neither is a payroll
          approval.
        </p>
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold">Current belt distribution</h3>
        {report.beltDistribution.length ? (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {report.beltDistribution.map((rank) => (
              <Stat key={rank.name} label={rank.name} value={String(rank.members)} />
            ))}
          </dl>
        ) : (
          <p className={TEXT}>No ranked members.</p>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold">Current family summary</h3>
        <p className={TEXT}>
          {report.family.households} households · {report.family.membersInHouseholds} active member records in households · {report.family.membersWithoutHousehold}{' '}
          without a linked household
        </p>
      </div>
    </div>
  );
}
