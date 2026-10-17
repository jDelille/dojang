'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, Field, Input, Select } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, preview, useHubActions, useHubRead } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/** Ported from Jodi's StudentIntake (PR #29): a reviewed new-student intake with an explicit household for a child. */

type Guardian = { id: string; name: string; householdId: string; household: string; version: number; householdVersion: number };
type IntakeContext = {
  guardians: Guardian[];
  moreGuardians: boolean;
  school: string;
  today: string;
  recent: { memberId: string; name: string; memberNumber: string }[];
};
type ExistingStudent = { memberId: string; name: string; memberNumber: string; active: boolean };
type Issue = { field: string; message: string };
type IntakePreview = {
  valid: boolean;
  issues?: Issue[];
  intake?: Record<string, unknown>;
  reviewToken?: string;
  guardianName?: string | null;
  householdName?: string | null;
  duplicateStudents?: ExistingStudent[];
  guardianMatches?: Guardian[];
  unselectableGuardianMatch?: boolean;
};
type Duplicates = { students: ExistingStudent[]; guardians: Guardian[]; unselectable: boolean };
type ReviewedStudent = { name: string; dateOfBirth: string; email: string; phone: string };

const SCOPE = 'intake';
const TEXT = 'text-[13px]';

const EMPTY_FIELDS = {
  studentName: '',
  birth: '',
  gender: '',
  studentEmail: '',
  studentPhone: '',
  guardianName: '',
  guardianEmail: '',
  guardianPhone: '',
  reviewRef: '',
};
type Fields = typeof EMPTY_FIELDS;

export function StudentIntake() {
  return (
    <HubGate capability="students.create">
      <StudentIntakeScreen />
    </HubGate>
  );
}

function StudentIntakeScreen() {
  const [search, setSearch] = useState('');
  const context = useHubRead<IntakeContext>(`students/intake?query=${encodeURIComponent(search)}`);
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(context.reload);

  const [studentType, setStudentType] = useState('adult');
  const [guardianKind, setGuardianKind] = useState('new');
  const [guardianId, setGuardianId] = useState('');
  const [guardianQuery, setGuardianQuery] = useState('');
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  // Guardians picked from a duplicate warning, kept even if the search list changes.
  const [matchedGuardians, setMatchedGuardians] = useState<Guardian[]>([]);

  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<IntakePreview | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [duplicates, setDuplicates] = useState<Duplicates | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const requestInFlight = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const result = feedback[SCOPE];
  const blocked = busy || locked || reviewing;
  const data = context.data;
  const listedGuardians = data?.guardians ?? [];
  const guardianOptions = [...matchedGuardians.filter((m) => !listedGuardians.some((g) => g.id === m.id)), ...listedGuardians];

  useEffect(() => {
    if (review || issues.length || reviewError || result) resultRef.current?.focus({ preventScroll: true });
  }, [review, issues, reviewError, result]);

  // Any change to the form throws away the last review, so staff always confirm what they see.
  function resetReview() {
    setReview(null);
    setConfirmed(false);
    setIssues([]);
    setDuplicates(null);
    setReviewError('');
    clearFeedback(SCOPE);
  }

  function setField(name: keyof Fields, value: string) {
    setFields((previous) => ({ ...previous, [name]: value }));
    resetReview();
  }

  function chooseExistingGuardian(match: Guardian) {
    if (blocked) return;
    resetReview();
    setMatchedGuardians((previous) => [match, ...previous.filter((g) => g.id !== match.id)]);
    setGuardianKind('existing');
    setGuardianId(match.id);
  }

  function buildIntake() {
    let guardian: Record<string, unknown> | null = null;
    if (studentType === 'child') {
      if (guardianKind === 'new') {
        guardian = { kind: 'new', name: fields.guardianName, email: fields.guardianEmail, phone: fields.guardianPhone };
      } else {
        const selected = guardianOptions.find((g) => g.id === guardianId);
        if (selected) {
          guardian = {
            kind: 'existing',
            partnerId: selected.id,
            householdId: selected.householdId,
            expectedVersion: selected.version,
            expectedHouseholdVersion: selected.householdVersion,
          };
        }
      }
    }
    return {
      studentType,
      student: {
        name: fields.studentName,
        email: fields.studentEmail,
        phone: fields.studentPhone,
        dateOfBirth: fields.birth,
        gender: fields.gender,
      },
      guardian,
      reviewRef: fields.reviewRef,
    };
  }

  async function runReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || requestInFlight.current || !data) return;
    requestInFlight.current = true;
    setReviewing(true);
    resetReview();
    try {
      const value = await preview<IntakePreview>('students/intake/preview', { intake: buildIntake() });
      if (value.valid !== true) {
        setIssues(value.issues?.length ? value.issues : [{ field: 'intake', message: 'The intake could not be reviewed.' }]);
        if (value.duplicateStudents?.length || value.guardianMatches?.length || value.unselectableGuardianMatch) {
          setDuplicates({
            students: value.duplicateStudents ?? [],
            guardians: value.guardianMatches ?? [],
            unselectable: Boolean(value.unselectableGuardianMatch),
          });
        }
        return;
      }
      if (typeof value.reviewToken !== 'string' || !value.intake) throw new Error('INTAKE_DETAILS_UNAVAILABLE');
      setReview(value);
    } catch (error) {
      setReviewError(explainHubError((error as Error).message));
    } finally {
      setReviewing(false);
      requestInFlight.current = false;
    }
  }

  function clearFormAfterSave() {
    setFields(EMPTY_FIELDS);
    setGuardianId('');
    setReview(null);
    setConfirmed(false);
  }

  async function save() {
    if (!review || !confirmed || blocked || requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const outcome = await act(SCOPE, 'students', { intake: review.intake, reviewToken: review.reviewToken });
      if (outcome?.kind === 'success') clearFormAfterSave();
      else if (outcome?.kind === 'error') {
        setReview(null);
        setConfirmed(false);
      }
    } finally {
      requestInFlight.current = false;
    }
  }

  async function checkResultAgain() {
    const outcome = await retry();
    if (outcome?.kind === 'success') clearFormAfterSave();
  }

  function searchGuardians() {
    setGuardianId('');
    setSearch(guardianQuery.trim());
  }

  function issuePrefix(field: string) {
    if (field.startsWith('student.')) return 'Student — ';
    if (field.startsWith('guardian.')) return 'Guardian — ';
    return '';
  }

  const reviewedStudent = review?.intake?.student as ReviewedStudent | undefined;
  const firstLoad = context.loading && !data;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className={cn(PANEL, 'space-y-1')}>
        <h2 className="text-base font-semibold">A clear start for a new student</h2>
        <p className={TEXT}>
          Create their Odoo profile and, for a child, an explicit household link. Staff must check identity and guardian authority.
        </p>
        <p className={cn(TEXT, 'muted')}>
          This does not book a trial, start a membership, grant portal access, sign a waiver or send a message.
        </p>
      </section>

      {firstLoad && <Notice>Loading your school’s intake options…</Notice>}
      {context.error && !context.loading && (
        <div className="space-y-2">
          <Notice tone="alert">{explainHubError(context.error)}</Notice>
          <Button size="sm" variant="secondary" disabled={blocked} onClick={() => void context.reload().catch(() => undefined)}>
            Reload intake options
          </Button>
        </div>
      )}

      {data && (
        <>
          <form onSubmit={runReview} noValidate className={cn(PANEL, 'space-y-5')}>
            <fieldset disabled={blocked} className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">1. Student details</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Student type">
                  <Select
                    value={studentType}
                    onChange={(event) => {
                      setStudentType(event.target.value);
                      resetReview();
                    }}
                  >
                    <option value="adult">Adult (18 or older)</option>
                    <option value="child">Child (under 18)</option>
                  </Select>
                </Field>
                <Field label="Student full name">
                  <Input value={fields.studentName} onChange={(e) => setField('studentName', e.target.value)} autoComplete="off" maxLength={200} />
                </Field>
                <Field label="Date of birth">
                  <Input type="date" value={fields.birth} onChange={(e) => setField('birth', e.target.value)} max={data.today} />
                </Field>
                <Field label="Gender (optional)">
                  <Select value={fields.gender} onChange={(e) => setField('gender', e.target.value)}>
                    <option value="">Not recorded</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Student email">
                  <Input type="email" value={fields.studentEmail} onChange={(e) => setField('studentEmail', e.target.value)} autoComplete="off" maxLength={200} />
                </Field>
                <Field label="Student phone">
                  <Input type="tel" value={fields.studentPhone} onChange={(e) => setField('studentPhone', e.target.value)} autoComplete="off" maxLength={40} />
                </Field>
              </div>
              <p className={cn(TEXT, 'muted')}>
                {studentType === 'adult'
                  ? 'An adult needs at least one contact method: email or phone.'
                  : 'Child contact details are optional. Enter the adult’s contact details under Guardian.'}
              </p>
            </fieldset>

            {studentType === 'child' && (
              <fieldset disabled={blocked} className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">2. Guardian and household</legend>
                <Field label="Guardian">
                  <Select
                    value={guardianKind}
                    onChange={(event) => {
                      setGuardianKind(event.target.value);
                      setGuardianId('');
                      resetReview();
                    }}
                  >
                    <option value="new">Create a new guardian and household</option>
                    <option value="existing">Use an existing school household</option>
                  </Select>
                </Field>

                {guardianKind === 'new' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Guardian full name">
                      <Input value={fields.guardianName} onChange={(e) => setField('guardianName', e.target.value)} autoComplete="off" maxLength={200} />
                    </Field>
                    <Field label="Guardian email">
                      <Input type="email" value={fields.guardianEmail} onChange={(e) => setField('guardianEmail', e.target.value)} autoComplete="off" maxLength={200} />
                    </Field>
                    <Field label="Guardian phone">
                      <Input type="tel" value={fields.guardianPhone} onChange={(e) => setField('guardianPhone', e.target.value)} autoComplete="off" maxLength={40} />
                    </Field>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[220px] flex-1">
                        <Field label="Find an existing guardian">
                          <Input
                            value={guardianQuery}
                            onChange={(e) => setGuardianQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                searchGuardians();
                              }
                            }}
                            maxLength={100}
                          />
                        </Field>
                      </div>
                      <Button type="button" variant="secondary" onClick={searchGuardians}>
                        Search households
                      </Button>
                    </div>
                    <Field label="Existing guardian">
                      <Select
                        value={guardianId}
                        onChange={(event) => {
                          setGuardianId(event.target.value);
                          resetReview();
                        }}
                      >
                        <option value="">Select the exact guardian and household</option>
                        {guardianOptions.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} · {g.household} · #{g.id}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {context.loading && <p className={cn(TEXT, 'muted')}>Searching households…</p>}
                    {data.moreGuardians && <p className={TEXT}>Showing the first 50 matching guardians. Narrow your search to find the exact household.</p>}
                    {!guardianOptions.length && !context.loading && (
                      <p className={TEXT}>
                        No active guardian households match. Records with a missing company or household link need administrator review in Odoo.
                      </p>
                    )}
                  </>
                )}
                <p className={cn(TEXT, 'muted')}>A household link does not verify a messaging channel or grant signing, payment or portal permissions.</p>
              </fieldset>
            )}

            <fieldset disabled={blocked} className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">{studentType === 'child' ? '3' : '2'}. Staff verification</legend>
              <Field label="Identity and guardian review reference">
                <Input value={fields.reviewRef} onChange={(e) => setField('reviewRef', e.target.value)} autoComplete="off" maxLength={300} />
              </Field>
              <p className={cn(TEXT, 'muted')}>
                Record a reference to the completed identity check and, for a child, the guardian-authority check. Do not paste identity documents or passwords.
              </p>
            </fieldset>

            <Button type="submit" variant="secondary" disabled={blocked}>
              {reviewing ? 'Checking intake…' : 'Review new student'}
            </Button>
          </form>

          <div ref={resultRef} tabIndex={-1} className="space-y-3 outline-none" aria-label="Student intake result">
            {issues.length > 0 && (
              <div role="alert" className={cn(PANEL, 'space-y-2')}>
                <h2 className="text-base font-semibold">{duplicates ? 'Check existing records first' : 'Complete these fields'}</h2>
                <ul className={cn(TEXT, 'list-disc space-y-1 ps-5')}>
                  {issues.map((issue, index) => (
                    <li key={`${issue.field}:${index}`}>
                      {issuePrefix(issue.field)}
                      {issue.message}
                    </li>
                  ))}
                </ul>
                <p className={TEXT}>Nothing has been created.</p>
                {duplicates?.students.map((s) => (
                  <p key={s.memberId} className={TEXT}>
                    {s.active ? (
                      <Link href={`/dashboard/contacts/${s.memberId}`} className="font-semibold underline underline-offset-4">
                        Open existing student {s.name} · {s.memberNumber} →
                      </Link>
                    ) : (
                      <>
                        {s.name} · {s.memberNumber} is archived. An administrator must review the archived profile in Odoo; do not create a replacement.
                      </>
                    )}
                  </p>
                ))}
                {duplicates?.guardians.map((g) => (
                  <div key={g.id} className={cn(TEXT, 'flex flex-wrap items-center gap-2')}>
                    <span>
                      {g.name} · {g.household}
                    </span>
                    <Button size="sm" variant="secondary" disabled={blocked} onClick={() => chooseExistingGuardian(g)}>
                      Use {g.household}
                    </Button>
                  </div>
                ))}
                {duplicates?.unselectable && (
                  <p className={TEXT}>A matching contact is not a selectable guardian household. Ask an administrator to review it in Odoo before linking a child.</p>
                )}
              </div>
            )}

            {reviewError && <Notice tone="alert">{reviewError}</Notice>}

            {review && reviewedStudent && (
              <section className={cn(PANEL, 'space-y-3')} aria-label="Review student intake">
                <h2 className="text-base font-semibold">Review before saving</h2>
                <dl className={cn(TEXT, 'grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1')}>
                  <dt className="muted">School</dt>
                  <dd>{data.school}</dd>
                  <dt className="muted">Student</dt>
                  <dd>{reviewedStudent.name}</dd>
                  <dt className="muted">Birth date</dt>
                  <dd>{reviewedStudent.dateOfBirth}</dd>
                  <dt className="muted">Contact</dt>
                  <dd>{[reviewedStudent.email, reviewedStudent.phone].filter(Boolean).join(' · ') || 'No child contact recorded'}</dd>
                  <dt className="muted">Guardian</dt>
                  <dd>{review.guardianName || 'Standalone adult'}</dd>
                  <dt className="muted">Household</dt>
                  <dd>{review.householdName || (review.guardianName ? 'New household' : 'None')}</dd>
                  <dt className="muted">Initial status</dt>
                  <dd>Lead — no membership or class enrollment</dd>
                  <dt className="muted">Verification</dt>
                  <dd>{String(review.intake?.reviewRef ?? '')}</dd>
                </dl>
                <label className={cn(TEXT, 'flex items-start gap-2')}>
                  <input type="checkbox" className="mt-0.5" checked={confirmed} disabled={blocked} onChange={(e) => setConfirmed(e.target.checked)} />
                  I checked the identity, guardian authority where it applies, and the exact information above.
                </label>
                <Button disabled={blocked || !confirmed} onClick={() => void save()}>
                  {busy ? 'Creating student…' : 'Confirm student in Odoo'}
                </Button>
              </section>
            )}

            <Feedback value={result} busy={busy} onRetry={pendingIn(SCOPE) ? () => void checkResultAgain() : undefined} />
            {result?.intake && (
              <Link href={`/dashboard/contacts/${result.intake.memberId}`} className="inline-block text-[13px] font-semibold underline underline-offset-4">
                Open created student →
              </Link>
            )}
          </div>

          {data.recent.length > 0 && (
            <section className={cn(PANEL, 'space-y-2')}>
              <h2 className="text-base font-semibold">Your recent student intakes</h2>
              <p className={cn(TEXT, 'muted')}>Loaded from your Odoo creation receipts. Check here after a reload before submitting another intake.</p>
              <ul className={cn(TEXT, 'space-y-1')}>
                {data.recent.map((r) => (
                  <li key={r.memberId}>
                    <Link href={`/dashboard/contacts/${r.memberId}`} className="underline underline-offset-4">
                      {r.name} · {r.memberNumber}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
