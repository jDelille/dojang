'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError, type ActionFeedback } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, preview, useHubActions, useHubRead } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/** Ported from Jodi's TestingWorkspace. */

type Rank = { id: string; name: string; sequence: number };
type Eligible = {
  memberId: string;
  name: string;
  currentRank: string | null;
  nextRank: { id: string; name: string } | null;
  attended: number;
  threshold: number | null;
  status: string;
  openTest: { testId: string; name: string } | null;
};
type TestRow = { id: string; name: string; date: string; state: string; count: number };
type Eligibility = { rows: Eligible[]; ranks: Rank[]; tests: TestRow[] };
type RosterRow = {
  registrationId: string;
  memberId: string;
  name: string;
  currentRank: string | null;
  targetRank: string;
  result: string;
  promotionId: string | null;
};
type Roster = {
  test: { id: string; name: string; date: string; state: string; version: number; program: string | null };
  rows: RosterRow[];
  school: string;
};
type PromotionPreview = {
  promotions: { registrationId: string; name: string; from: string | null; to: string }[];
  conflicts: { registrationId: string; name: string; problem: string }[];
  version: number;
  valid: boolean;
  reviewToken: string | null;
};
type HistoryRow = {
  id: string;
  memberId: string;
  name: string;
  rank: string;
  stripes: number;
  date: string;
  memberVersion: number;
  source: string;
  reversed: boolean;
  reversedBy: string | null;
  reversalReason: string | null;
  latest: boolean;
};
/** One write waiting for "Review before saving": what is sent, and what staff are shown. */
type Review = { path: string; payload: Record<string, unknown>; expectedVersion: number; lines: string[]; effects: string[] };

const RESULTS = ['pending', 'pass', 'fail', 'withdrew'];
const STATUS: Record<string, string> = {
  eligible: 'Eligible',
  not_yet: 'Not yet',
  no_threshold: 'No attendance rule',
  top_rank: 'Highest belt',
};
const TEXT = 'text-[13px]';
const SCOPE = 'testing';
const today = () => new Date().toISOString().slice(0, 10);

export function BeltTesting() {
  return (
    <HubGate capability="testing.manage">
      <BeltTestingScreen />
    </HubGate>
  );
}

function BeltTestingScreen() {
  // Eligibility
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const eligibility = useHubRead<Eligibility>(`testing/eligibility?query=${encodeURIComponent(search)}`);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [testName, setTestName] = useState('');
  const [testDate, setTestDate] = useState(today);
  const [rosterReason, setRosterReason] = useState('');

  // One saved test
  const [testId, setTestId] = useState('');
  const roster = useHubRead<Roster>(testId ? `testing/tests/${testId}` : null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [resultReason, setResultReason] = useState('');
  const [promote, setPromote] = useState<string[]>([]);
  const [promotionPreview, setPromotionPreview] = useState<PromotionPreview | null>(null);
  const [promotionReason, setPromotionReason] = useState('');

  // Promotion history, loaded when staff search it
  const [historyQuery, setHistoryQuery] = useState('');
  const [historySearch, setHistorySearch] = useState<string | null>(null);
  const history = useHubRead<{ rows: HistoryRow[] }>(
    historySearch === null ? null : `testing/promotions?query=${encodeURIComponent(historySearch)}`,
  );
  const [reversing, setReversing] = useState<Record<string, string>>({});

  const [review, setReview] = useState<Review | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [readError, setReadError] = useState('');
  const reviewRef = useRef<HTMLDivElement>(null);

  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(async () => {
    await Promise.all([eligibility.reload(), roster.reload(), history.reload()]);
  });
  const result = feedback[SCOPE];
  const blocked = busy || locked;

  // Results start from what Odoo has saved, whenever the roster (re)loads.
  useEffect(() => {
    if (!roster.data) return;
    setResults(Object.fromEntries(roster.data.rows.map((row) => [row.registrationId, row.result])));
    setPromote([]);
    setPromotionPreview(null);
  }, [roster.data]);

  useEffect(() => {
    if (review || result) reviewRef.current?.focus({ preventScroll: true });
  }, [review, result]);

  const data = eligibility.data;
  const test = roster.data && roster.data.test.id === testId ? roster.data : null;
  const chosen = Object.entries(picked).filter(([, rankId]) => rankId);
  const rankName = (id: string) => data?.ranks.find((rank) => rank.id === id)?.name ?? '';
  const changed = test ? test.rows.filter((row) => results[row.registrationId] !== row.result) : [];
  const editable = test ? ['scheduled', 'in_progress'].includes(test.test.state) : false;

  function openReview(next: Review) {
    clearFeedback(SCOPE);
    setConfirmed(false);
    setReview(next);
  }

  function afterWrite(saved?: ActionFeedback) {
    if (saved?.kind === 'success' || saved?.kind === 'error') {
      setReview(null);
      setConfirmed(false);
    }
    if (saved?.kind === 'success') {
      setPicked({});
      setRosterReason('');
      setResultReason('');
      setPromotionReason('');
      setPromotionPreview(null);
      setReversing({});
    }
    // A new roster opens straight away.
    if (saved?.testing) setTestId(saved.testing.testId);
  }

  async function confirm() {
    if (!review || !confirmed || blocked) return;
    afterWrite(await act(SCOPE, review.path, review.payload, { expectedVersion: review.expectedVersion }));
  }

  async function loadPromotionPreview() {
    if (!test) return;
    setReadError('');
    try {
      setPromotionPreview(await preview<PromotionPreview>(`testing/tests/${test.test.id}/promotions/preview`, { registrationIds: promote }));
    } catch (error) {
      setReadError(explainHubError((error as Error).message));
    }
  }

  function chooseTest(id: string) {
    setTestId(id);
    setReadError('');
    clearFeedback(SCOPE);
  }

  function reviewNewRoster() {
    if (!data) return;
    openReview({
      path: 'testing/tests',
      expectedVersion: 0,
      payload: {
        testId: null,
        name: testName.trim(),
        testDate,
        add: chosen.map(([memberId, targetRankId]) => ({ memberId, targetRankId })),
        removeRegistrationIds: [],
        reason: rosterReason.trim(),
      },
      lines: [
        `New test: ${testName.trim()} on ${testDate}`,
        ...chosen.map(([memberId, rankId]) => `${data.rows.find((row) => row.memberId === memberId)?.name} → ${rankName(rankId)}`),
        `Reason: ${rosterReason.trim()}`,
      ],
      effects: [
        'Creates a native belt test with pending registrations. No belt, invoice or message is created.',
        'Students on the roster are marked as having a pending test, so the daily eligibility job does not create a duplicate test or testing-fee invoice.',
      ],
    });
  }

  function reviewResults() {
    if (!test) return;
    openReview({
      path: `testing/tests/${test.test.id}/results`,
      expectedVersion: test.test.version,
      payload: {
        results: changed.map((row) => ({ registrationId: row.registrationId, result: results[row.registrationId] })),
        reason: resultReason.trim(),
      },
      lines: [...changed.map((row) => `${row.name}: ${row.result} → ${results[row.registrationId]}`), `Reason: ${resultReason.trim()}`],
      effects: [
        'Saves results on the native registrations. No belt is awarded until you promote.',
        'A final result clears the pending-test flag. The daily eligibility job can invite the student again later, with a testing-fee invoice if the next belt has one configured.',
      ],
    });
  }

  function reviewPromotions() {
    if (!test || !promotionPreview?.reviewToken) return;
    openReview({
      path: `testing/tests/${test.test.id}/promotions`,
      expectedVersion: promotionPreview.version,
      payload: { registrationIds: promote, reason: promotionReason.trim(), reviewToken: promotionPreview.reviewToken },
      lines: [
        ...promotionPreview.promotions.map((item) => `${item.name}: ${item.from || 'No belt'} → ${item.to}`),
        `Reason: ${promotionReason.trim()}`,
      ],
      effects: [
        `Adds a belt history entry for each student dated ${test.test.date}. Attendance progress restarts from that date.`,
        'No message, certificate or invoice is sent.',
      ],
    });
  }

  function reviewReversal(row: HistoryRow) {
    const reason = (reversing[row.id] ?? '').trim();
    openReview({
      path: `promotions/${row.id}/reversal`,
      expectedVersion: row.memberVersion,
      payload: { reason },
      lines: [`${row.name}: remove ${row.rank} awarded ${row.date}`, `Reason: ${reason}`],
      effects: ['The award is archived with your name and reason; the student returns to the previous belt.', 'No message is sent.'],
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className={cn(PANEL, 'space-y-1')}>
        <p className={TEXT}>
          Build a testing roster from attendance progress, record results, then promote passing students after a review. Every step is saved on
          Odoo&apos;s belt tests and belt history.
        </p>
        <p className={cn(TEXT, 'muted')}>Nothing here sends a message or creates an invoice. Reversal keeps the original award in history.</p>
      </section>

      {readError && <Notice tone="alert">{readError}</Notice>}

      {/* Eligibility and a new roster */}
      <section className={cn(PANEL, 'space-y-4')} aria-label="Testing eligibility">
        <h2 className="text-base font-semibold">Eligibility</h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(query.trim());
          }}
        >
          <div className="min-w-[200px] flex-1">
            <Field label="Find students">
              <Input value={query} maxLength={100} disabled={blocked} onChange={(event) => setQuery(event.target.value)} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={blocked}>
            Search students
          </Button>
        </form>

        {eligibility.loading && <Notice>Loading eligibility from Odoo…</Notice>}
        {!eligibility.loading && eligibility.error && <Notice tone="alert">{explainHubError(eligibility.error)}</Notice>}

        {data && (
          <>
            <div className="space-y-2">
              {data.rows.map((row) => {
                const canPick = !row.openTest && row.nextRank;
                return (
                  <div
                    key={row.memberId}
                    role="group"
                    aria-label={`Eligibility for ${row.name}`}
                    className={cn(TEXT, 'flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color:var(--color-border)] pb-2 last:border-b-0')}
                  >
                    <span className="w-4">
                      {canPick && (
                        <input
                          type="checkbox"
                          aria-label={`Add ${row.name} to roster`}
                          checked={Boolean(picked[row.memberId])}
                          disabled={blocked}
                          onChange={(event) =>
                            setPicked((previous) => ({ ...previous, [row.memberId]: event.target.checked ? row.nextRank!.id : '' }))
                          }
                        />
                      )}
                    </span>
                    <strong className="min-w-[140px]">{row.name}</strong>
                    <span>
                      {row.currentRank || 'No belt'} → {row.nextRank?.name || '—'}
                    </span>
                    <span className="muted">
                      {STATUS[row.status] ?? row.status}
                      {row.openTest ? ` · on ${row.openTest.name}` : ''} ·{' '}
                      {row.threshold ? `${row.attended}/${row.threshold} classes` : `${row.attended} classes`}
                    </span>
                    {canPick && picked[row.memberId] && (
                      <Select
                        aria-label={`Testing rank for ${row.name}`}
                        className="w-auto"
                        value={picked[row.memberId]}
                        disabled={blocked}
                        onChange={(event) => setPicked((previous) => ({ ...previous, [row.memberId]: event.target.value }))}
                      >
                        {data.ranks.map((rank) => (
                          <option key={rank.id} value={rank.id}>
                            Testing for {rank.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                );
              })}
              {!data.rows.length && <p className={TEXT}>No active students match.</p>}
            </div>

            <div className="space-y-3">
              <h3 className="text-[13px] font-semibold">New testing roster</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Test name">
                  <Input value={testName} maxLength={200} disabled={blocked} onChange={(event) => setTestName(event.target.value)} />
                </Field>
                <Field label="Test date">
                  <Input type="date" value={testDate} disabled={blocked} onChange={(event) => setTestDate(event.target.value)} />
                </Field>
              </div>
              <Field label="Reason for this roster">
                <Input value={rosterReason} maxLength={500} disabled={blocked} onChange={(event) => setRosterReason(event.target.value)} />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  disabled={blocked || !chosen.length || !testName.trim() || !testDate || !rosterReason.trim()}
                  onClick={reviewNewRoster}
                >
                  Review testing roster
                </Button>
                <span className={cn(TEXT, 'muted')}>Select at least one student, then add a name and reason.</span>
              </div>
            </div>

            <Field label="Saved tests">
              <Select aria-label="Saved tests" value={testId} disabled={blocked} onChange={(event) => chooseTest(event.target.value)}>
                <option value="">Choose a test</option>
                {data.tests.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.date} · {item.state} · {item.count} students
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </section>

      {/* One saved test: results and promotions */}
      {testId && roster.loading && <Notice>Loading the testing roster…</Notice>}
      {testId && !roster.loading && roster.error && <Notice tone="alert">{explainHubError(roster.error)}</Notice>}
      {test && (
        <section className={cn(PANEL, 'space-y-4')} aria-label="Testing roster">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{test.test.name}</h2>
              <p className={cn(TEXT, 'muted')}>
                {test.school} · {test.test.date} · {test.test.state}
                {test.test.program ? ` · ${test.test.program}` : ''}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print testing roster
            </Button>
          </div>

          {test.rows.map((row) => (
            <div
              key={row.registrationId}
              role="group"
              aria-label={`Testing row for ${row.name}`}
              className={cn(TEXT, 'flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color:var(--color-border)] pb-2 last:border-b-0')}
            >
              <strong className="min-w-[140px]">{row.name}</strong>
              <span>
                {row.currentRank || 'No belt'} → {row.targetRank}
                {row.promotionId ? ' · promoted' : ''}
              </span>
              <Select
                aria-label={`Result for ${row.name}`}
                className="w-auto"
                value={results[row.registrationId] ?? row.result}
                disabled={blocked || !editable || Boolean(row.promotionId)}
                onChange={(event) => setResults((previous) => ({ ...previous, [row.registrationId]: event.target.value }))}
              >
                {RESULTS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              {row.result === 'pass' && !row.promotionId && (
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    aria-label={`Promote ${row.name}`}
                    checked={promote.includes(row.registrationId)}
                    disabled={blocked}
                    onChange={(event) => {
                      setPromotionPreview(null);
                      setPromote((previous) =>
                        event.target.checked ? [...previous, row.registrationId] : previous.filter((id) => id !== row.registrationId),
                      );
                    }}
                  />
                  Promote
                </label>
              )}
            </div>
          ))}
          {!test.rows.length && <p className={TEXT}>No students on this test.</p>}

          {editable && (
            <div className="space-y-3">
              <Field label="Reason for results">
                <Input value={resultReason} maxLength={500} disabled={blocked} onChange={(event) => setResultReason(event.target.value)} />
              </Field>
              <Button variant="secondary" disabled={blocked || !changed.length || !resultReason.trim()} onClick={reviewResults}>
                Review results
              </Button>
            </div>
          )}

          {promote.length > 0 && (
            <Button variant="secondary" disabled={blocked} onClick={() => void loadPromotionPreview()}>
              Preview promotions
            </Button>
          )}
          {promotionPreview && (
            <div className="space-y-2" aria-label="Promotion preview">
              {promotionPreview.promotions.map((item) => (
                <p key={item.registrationId} className={TEXT}>
                  {item.name}: {item.from || 'No belt'} → {item.to}
                </p>
              ))}
              {promotionPreview.conflicts.map((conflict) => (
                <p key={conflict.registrationId} role="alert" className={cn(TEXT, 'text-alert')}>
                  {conflict.name}: {conflict.problem}
                </p>
              ))}
              {promotionPreview.valid && promotionPreview.reviewToken && (
                <div className="space-y-3">
                  <Field label="Reason for promotions">
                    <Input
                      value={promotionReason}
                      maxLength={500}
                      disabled={blocked}
                      onChange={(event) => setPromotionReason(event.target.value)}
                    />
                  </Field>
                  <Button variant="secondary" disabled={blocked || !promotionReason.trim()} onClick={reviewPromotions}>
                    Review promotions
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Only this block prints (see .hub-printable in globals.css). */}
          <article className="hub-printable hidden space-y-2 print:block" aria-label="Printable testing roster">
            <h2 className="text-lg font-semibold">{test.test.name}</h2>
            <p>
              {test.school} · {test.test.date}
              {test.test.program ? ` · ${test.test.program}` : ''}
            </p>
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Current belt</th>
                  <th>Testing for</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {test.rows.map((row) => (
                  <tr key={row.registrationId}>
                    <td>{row.name}</td>
                    <td>{row.currentRank || 'No belt'}</td>
                    <td>{row.targetRank}</td>
                    <td>{row.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </section>
      )}

      {/* Promotion history and reversal */}
      <section className={cn(PANEL, 'space-y-3')} aria-label="Promotion history">
        <h2 className="text-base font-semibold">Promotion history</h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setHistorySearch(historyQuery.trim());
          }}
        >
          <div className="min-w-[200px] flex-1">
            <Field label="Find promotion history">
              <Input value={historyQuery} maxLength={100} disabled={blocked} onChange={(event) => setHistoryQuery(event.target.value)} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={blocked}>
            Search history
          </Button>
        </form>
        {history.loading && <Notice>Loading belt history…</Notice>}
        {!history.loading && history.error && <Notice tone="alert">{explainHubError(history.error)}</Notice>}
        {history.data?.rows.map((row) => (
          <div
            key={row.id}
            role="group"
            aria-label={`Award ${row.rank} for ${row.name}`}
            className={cn(TEXT, 'space-y-2 border-b border-[color:var(--color-border)] pb-3 last:border-b-0')}
          >
            <p className="font-semibold">
              {row.name} · {row.rank}
              {row.stripes ? ` · ${row.stripes} stripes` : ''}
            </p>
            <p className="muted">
              {row.date} · {row.source}
              {row.reversed ? ` · reversed by ${row.reversedBy}: ${row.reversalReason}` : ''}
            </p>
            {row.latest && !row.reversed && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <Field label="Reason for reversing">
                    <Input
                      aria-label={`Reason for reversing ${row.name}`}
                      value={reversing[row.id] ?? ''}
                      maxLength={500}
                      disabled={blocked}
                      onChange={(event) => setReversing((previous) => ({ ...previous, [row.id]: event.target.value }))}
                    />
                  </Field>
                </div>
                <Button size="sm" variant="secondary" disabled={blocked || !(reversing[row.id] ?? '').trim()} onClick={() => reviewReversal(row)}>
                  Review reversal
                </Button>
              </div>
            )}
          </div>
        ))}
        {history.data && !history.data.rows.length && <p className={TEXT}>No belt history matches.</p>}
      </section>

      {/* Review before saving, and the result */}
      <div ref={reviewRef} tabIndex={-1} aria-label="Testing result" className="space-y-4">
        {review && (
          <section className={cn(PANEL, 'space-y-3')} aria-label="Review testing action">
            <h2 className="text-base font-semibold">Review before saving</h2>
            {review.lines.map((line, index) => (
              <p key={index} className={TEXT}>
                {line}
              </p>
            ))}
            {review.effects.map((line, index) => (
              <p key={index} className={cn(TEXT, 'muted')}>
                {line}
              </p>
            ))}
            <label className={cn(TEXT, 'flex items-start gap-2')}>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                disabled={blocked}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I reviewed this testing action.
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={blocked || !confirmed} onClick={() => void confirm()}>
                {busy ? 'Saving…' : 'Confirm testing action in Odoo'}
              </Button>
              <Button variant="ghost" disabled={blocked} onClick={() => setReview(null)}>
                Cancel
              </Button>
            </div>
          </section>
        )}
        <Feedback value={result} busy={busy} onRetry={pendingIn(SCOPE) ? () => void retry().then(afterWrite) : undefined} />
      </div>
    </div>
  );
}
