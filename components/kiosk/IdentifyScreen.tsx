import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import KioskFrame from "./KioskFrame";
import type {
	RosterMember,
	SessionOption,
} from "@/lib/kiosk/contracts/kiosk-attendance";
import type { RosterLoad } from "@/lib/kiosk/domain/kiosk/checkInFlow";
import {
	MIN_SEARCH_LETTERS,
	searchRoster,
} from "@/lib/kiosk/domain/kiosk/rosterSearch";
import {
	formatDuration,
	formatStartTime,
} from "@/lib/kiosk/domain/kiosk/sessionFormat";

type Props = {
	session: SessionOption; // the class picked on the last screen
	roster: RosterLoad; // loading, ready (with a list) or unavailable
	query: string; // typed so far. it lives in the flow so a privacy reset clears it
	onQuery: (query: string) => void;
	onPick: (member: RosterMember) => void;
	onBack: () => void;
	onRetry: () => void;
};

export default function IdentifyScreen({
	session,
	roster,
	query,
	onQuery,
	onPick,
	onBack,
	onRetry,
}: Props) {
	const t = formatStartTime(session.startsAt, session.timeZone);
	// search only once the roster has arrived. null = nothing to show yet
	const result =
		roster.status === "ready" ? searchRoster(roster.list, query) : null;

	return (
		<KioskFrame label="Identify">
			<button
				onClick={onBack}
				className="mb-6 flex min-h-12 w-fit items-center gap-2 text-base text-kiosk-fg-secondary"
			>
				<ArrowLeft className="h-5 w-5" /> Back
			</button>

			{/* which class we are checking into, so a wrong pick is easy to spot */}
			<p className="font-mono text-xs uppercase tracking-[0.2em] text-kiosk-muted">
				{session.title} · {t.time} {t.period} ·{" "}
				{formatDuration(session.startsAt, session.endsAt)}
			</p>
			<h1 className="mt-4 text-5xl font-bold tracking-tighter sm:text-6xl">
				Find your name
			</h1>
			<p className="mt-3 text-lg text-kiosk-fg-secondary">
				Type the first letters of your name.
			</p>

			<div className="relative mt-8">
				<Search className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-kiosk-muted" />
				<input
					value={query}
					onChange={(e) => onQuery(e.target.value)}
					placeholder="Start typing your name"
					aria-label="Your name"
					autoFocus
					autoComplete="off"
					autoCapitalize="words"
					spellCheck={false}
					className="min-h-16 w-full rounded-2xl border border-kiosk-line bg-kiosk-canvas pl-14 pr-5 text-2xl outline-none focus:border-kiosk-brand"
				/>
			</div>

			<div className="mt-4 space-y-3">
				{roster.status === "loading" && (
					<p className="text-lg text-kiosk-muted">Loading the class list…</p>
				)}

				{roster.status === "unavailable" && (
					<div className="rounded-2xl border border-kiosk-line bg-kiosk-canvas p-6">
						<p className="text-lg">
							We can&apos;t load the class list right now.
						</p>
						<button
							onClick={onRetry}
							className="mt-4 min-h-12 rounded-2xl bg-kiosk-brand px-6 text-lg font-semibold"
						>
							Try again
						</button>
					</div>
				)}

				{/* never show the whole roster: nobody until MIN letters are typed */}
				{result?.status === "tooShort" && (
					<p className="text-lg text-kiosk-muted">
						Type at least {MIN_SEARCH_LETTERS} letters.
					</p>
				)}
				{result?.status === "noMatch" && (
					<p className="text-lg text-kiosk-fg-secondary">
						No match. Check the spelling, or ask staff for help.
					</p>
				)}
				{result?.status === "found" &&
					result.matches.map((m) => (
						<button
							key={m.memberId}
							onClick={() => onPick(m)}
							className="flex w-full items-center justify-between rounded-2xl border border-kiosk-line bg-kiosk-canvas px-6 py-5 text-left text-2xl font-semibold transition-colors hover:bg-kiosk-interactive active:bg-kiosk-interactive"
						>
							{m.displayName}
							<ArrowRight className="h-6 w-6 shrink-0" />
						</button>
					))}
			</div>
		</KioskFrame>
	);
}
