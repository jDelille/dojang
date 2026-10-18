"use client"; // has a timer, which only works in the browser

import { useEffect } from "react";
import { Check } from "lucide-react";
import KioskFrame from "./KioskFrame";
import type {
	RosterMember,
	SessionOption,
} from "@/lib/kiosk/contracts/kiosk-attendance";
import type { CheckInOutcome } from "@/lib/kiosk/domain/kiosk/checkInOutcome";
import {
	formatClockTime,
	formatStartTime,
} from "@/lib/kiosk/domain/kiosk/sessionFormat";

const AUTO_CLEAR_MS = 15_000; // paul's doc: person data clears after 15 seconds

// what we say when it did not work. never a reason (no debt, billing, medical details)
const MESSAGES = {
	seeFrontDesk: {
		title: "Please see the front desk",
		body: "A staff member will help you.",
	},
	chooseAnotherClass: {
		title: "Please choose another class",
		body: "This class isn't open for check-in right now.",
	},
	kioskUnavailable: {
		title: "This kiosk is unavailable",
		body: "Please see a staff member.",
	},
	notConfirmed: {
		title: "We couldn't confirm your check-in",
		body: "It may not have been saved. Try again, or see a staff member.",
	},
} as const;

type Props = {
	session: SessionOption;
	member: RosterMember;
	outcome: CheckInOutcome;
	onDone: () => void;
	onRetry: () => void;
	onChooseClass: () => void;
};

export default function ResultScreen({
	session,
	member,
	outcome,
	onDone,
	onRetry,
	onChooseClass,
}: Props) {
	// privacy reset: go back to Welcome on our own, even if nobody taps Done
	useEffect(() => {
		const id = setTimeout(onDone, AUTO_CLEAR_MS);
		return () => clearTimeout(id); // cancel the timer if we leave this screen sooner
	}, [onDone]);

	const t = formatStartTime(session.startsAt, session.timeZone);

	// success, or the server says we were already checked in
	if (outcome.kind === "success" || outcome.kind === "alreadyCheckedIn") {
		const { receipt } = outcome;
		const late = receipt.status === "late";

		return (
			<KioskFrame label="Result">
				<div className="flex h-20 w-20 items-center justify-center rounded-full bg-kiosk-success/15 text-kiosk-success">
					<Check className="h-10 w-10" />
				</div>
				<h1 className="mt-6 text-5xl font-bold tracking-tighter sm:text-6xl">
					{outcome.kind === "success"
						? "You're checked in"
						: "You're already checked in"}
				</h1>

				<dl className="mt-8 grid grid-cols-[8rem_1fr] gap-y-3 rounded-2xl border border-kiosk-line bg-kiosk-canvas p-6 text-xl">
					<dt className="text-kiosk-muted">Student</dt>
					<dd className="font-semibold">{member.displayName}</dd>
					<dt className="text-kiosk-muted">Class</dt>
					<dd className="font-semibold">
						{session.title} · {t.time} {t.period}
					</dd>
					<dt className="text-kiosk-muted">Checked in</dt>
					<dd className="font-semibold">
						{formatClockTime(receipt.checkedInAt)}
						{late && (
							<span className="ml-3 rounded-full bg-kiosk-warning/15 px-3 py-1 text-base text-kiosk-warning">
								Late
							</span>
						)}
					</dd>
				</dl>

				<button
					onClick={onDone}
					className="mt-8 min-h-16 w-full rounded-2xl bg-kiosk-brand text-2xl font-semibold"
				>
					Done
				</button>
				<p className="mt-3 text-center text-base text-kiosk-muted">
					This screen clears automatically for the next person.
				</p>
			</KioskFrame>
		);
	}

	// every other outcome is a refusal or a problem
	const message = MESSAGES[outcome.kind];

	return (
		<KioskFrame label="Result">
			<h1 className="text-5xl font-bold tracking-tighter sm:text-6xl">
				{message.title}
			</h1>
			<p className="mt-3 text-lg text-kiosk-fg-secondary">{message.body}</p>

			{/* the one action that helps for this kind of problem */}
			{outcome.kind === "notConfirmed" && (
				<button
					onClick={onRetry}
					className="mt-8 min-h-16 w-full rounded-2xl bg-kiosk-brand text-2xl font-semibold"
				>
					Try again
				</button>
			)}
			{outcome.kind === "chooseAnotherClass" && (
				<button
					onClick={onChooseClass}
					className="mt-8 min-h-16 w-full rounded-2xl bg-kiosk-brand text-2xl font-semibold"
				>
					Choose a class
				</button>
			)}

			<button
				onClick={onDone}
				className="mt-4 min-h-16 w-full rounded-2xl border border-kiosk-line text-2xl font-semibold"
			>
				Done
			</button>
		</KioskFrame>
	);
}
