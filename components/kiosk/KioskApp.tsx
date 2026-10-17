"use client"; // uses state and effects, which only work in the browser

import { useCallback, useEffect, useReducer } from "react";
import {
	checkInFlowReducer,
	initialCheckInFlow,
} from "@/lib/kiosk/domain/kiosk/checkInFlow";
import { createCheckInCommand } from "@/lib/kiosk/domain/kiosk/checkInCommand";
import {
	outcomeFor,
	type CheckInAnswer,
} from "@/lib/kiosk/domain/kiosk/checkInOutcome";
import { getRoster, listSessions, submitCheckIn } from "@/lib/kiosk/demo";
import KioskFrame from "./KioskFrame";
import WelcomeScreen from "./WelcomeScreen";
import ClassesScreen from "./ClassesScreen";
import IdentifyScreen from "./IdentifyScreen";
import ConfirmScreen from "./ConfirmScreen";
import ResultScreen from "./ResultScreen";

export default function KioskApp() {
	// the reducer decides the next step. screens only say what happened (dispatch)
	const [state, dispatch] = useReducer(checkInFlowReducer, initialCheckInFlow);

	// a stable "go back to a clean welcome" function (the result screen's timer needs one that never changes)
	const reset = useCallback(() => dispatch({ type: "reset" }), []);

	// class step with the list still "loading": fetch it, then report back
	const loading =
		state.step === "session" && state.sessions.status === "loading";
	useEffect(() => {
		if (!loading) return;
		let cancelled = false; // ignore the answer if we left this step meanwhile
		listSessions()
			.then(
				(sessions) =>
					!cancelled && dispatch({ type: "sessionsLoaded", sessions }),
			)
			.catch(() => !cancelled && dispatch({ type: "sessionsFailed" }));
		return () => {
			cancelled = true;
		};
	}, [loading]);

	// identify step with the roster still "loading": fetch it, then report back
	const rosterSessionId =
		state.step === "identify" && state.roster.status === "loading"
			? state.session.sessionId
			: null;
	useEffect(() => {
		if (!rosterSessionId) return;
		let cancelled = false;
		getRoster(rosterSessionId)
			.then(
				(roster) =>
					!cancelled &&
					dispatch({
						type: "rosterLoaded",
						sessionId: rosterSessionId,
						roster,
					}),
			)
			.catch(
				() =>
					!cancelled &&
					dispatch({ type: "rosterFailed", sessionId: rosterSessionId }),
			);
		return () => {
			cancelled = true;
		};
	}, [rosterSessionId]);

	// sending step: send the command, turn the answer into an outcome, report back
	const sendingCommand = state.step === "sending" ? state.command : null;
	useEffect(() => {
		if (!sendingCommand) return;
		let cancelled = false;
		submitCheckIn(sendingCommand)
			.catch((): CheckInAnswer => ({ kind: "noAnswer" })) // a network error means "we can't say it saved"
			.then(
				(answer) =>
					!cancelled &&
					dispatch({
						type: "checkInAnswered",
						correlationId: sendingCommand.correlationId,
						outcome: outcomeFor(answer, sendingCommand),
					}),
			);
		return () => {
			cancelled = true;
		};
	}, [sendingCommand]);

	if (state.step === "welcome") {
		return <WelcomeScreen onCheckIn={() => dispatch({ type: "start" })} />;
	}

	if (state.step === "session") {
		return (
			<ClassesScreen
				sessions={state.sessions}
				onPick={(session) => dispatch({ type: "selectSession", session })}
				onBack={() => dispatch({ type: "back" })}
				onRetry={() => dispatch({ type: "retrySessions" })}
			/>
		);
	}

	if (state.step === "identify") {
		return (
			<IdentifyScreen
				session={state.session}
				roster={state.roster}
				query={state.query}
				onQuery={(query) => dispatch({ type: "searchChanged", query })}
				onPick={(member) => dispatch({ type: "selectMember", member })}
				onBack={() => dispatch({ type: "back" })}
				onRetry={() => dispatch({ type: "retryRoster" })}
			/>
		);
	}

	if (state.step === "confirm") {
		return (
			<ConfirmScreen
				session={state.session}
				member={state.member}
				onBack={() => dispatch({ type: "back" })}
				onConfirm={() => {
					// build the command once. a retry resends this exact one (same idempotency key)
					const command = createCheckInCommand(state.session, state.member);
					dispatch(
						command
							? { type: "submitCheckIn", command }
							: { type: "commandRejected" },
					);
				}}
			/>
		);
	}

	if (state.step === "sending") {
		return (
			<KioskFrame label="Checking in">
				<p className="text-3xl font-semibold">Checking you in…</p>
			</KioskFrame>
		);
	}

	if (state.step === "result") {
		return (
			<ResultScreen
				session={state.session}
				member={state.member}
				outcome={state.outcome}
				onDone={reset}
				onRetry={() => dispatch({ type: "retryCheckIn" })}
				onChooseClass={() => dispatch({ type: "changeSession" })}
			/>
		);
	}

	// the only step left is "concierge" (Ask a question / staff help). not built yet
	return (
		<KioskFrame label={state.step}>
			<p className="text-3xl font-semibold">
				&quot;{state.step}&quot; screen coming next
			</p>
			<button
				onClick={reset}
				className="mt-8 min-h-12 w-fit rounded-2xl border border-kiosk-line px-6 text-lg"
			>
				Start over
			</button>
		</KioskFrame>
	);
}
