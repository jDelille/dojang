"use client"; // uses state and effects, which only work in the browser

import {
	useCallback,
	useEffect,
	useReducer,
	useState,
	type ReactNode,
} from "react";
import {
	checkInFlowReducer,
	initialCheckInFlow,
} from "@/lib/kiosk/domain/kiosk/checkInFlow";
import { createCheckInCommand } from "@/lib/kiosk/domain/kiosk/checkInCommand";
import {
	outcomeFor,
	type CheckInAnswer,
} from "@/lib/kiosk/domain/kiosk/checkInOutcome";
import {
	IDLE_TIMEOUT_SECONDS,
	IDLE_WARNING_SECONDS,
} from "@/lib/kiosk/domain/kiosk/kioskConfig";
import { getRoster, listSessions, submitCheckIn } from "@/lib/kiosk/api";
import KioskFrame from "./KioskFrame";
import WelcomeScreen from "./WelcomeScreen";
import ClassesScreen from "./ClassesScreen";
import IdentifyScreen from "./IdentifyScreen";
import ConfirmScreen from "./ConfirmScreen";
import ResultScreen from "./ResultScreen";
import IdleWarning from "./IdleWarning";
import { useIdleTimer } from "./useIdleTimer";
import HelpScreen from "./HelpScreen";
import EventsScreen from "./EventsScreen";

export default function KioskApp() {
	// the reducer decides the next step. screens only say what happened (dispatch)
	const [state, dispatch] = useReducer(checkInFlowReducer, initialCheckInFlow);

	// events is a read-only side trip from welcome, so a simple flag is enough
	const [showEvents, setShowEvents] = useState(false);

	const reset = useCallback(() => {
		setShowEvents(false);
		dispatch({ type: "reset" });
	}, []);

	// privacy idle timer: nobody touched the screen for a while, so clear everything.
	// it runs only once someone has started (not on welcome) and not mid-send
	const idle = useIdleTimer({
		active:
			(state.step !== "welcome" || showEvents) && state.step !== "sending",
		restartKey: `${state.step}-${showEvents}`,
		timeoutSeconds: IDLE_TIMEOUT_SECONDS,
		warningSeconds: IDLE_WARNING_SECONDS,
		onTimeout: reset,
	});

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

	// pick the screen for the current step
	let screen: ReactNode;

	if (state.step === "welcome" && showEvents) {
		screen = <EventsScreen onBack={reset} />;
	} else if (state.step === "welcome") {
		screen = (
			<WelcomeScreen
				onCheckIn={() => dispatch({ type: "start" })}
				onHelp={() => dispatch({ type: "getStaffHelp" })}
				onTrial={() => dispatch({ type: "openConcierge" })}
				onEvents={() => setShowEvents(true)}
			/>
		);
	} else if (state.step === "session") {
		screen = (
			<ClassesScreen
				sessions={state.sessions}
				onPick={(session) => dispatch({ type: "selectSession", session })}
				onBack={() => dispatch({ type: "back" })}
				onRetry={() => dispatch({ type: "retrySessions" })}
			/>
		);
	} else if (state.step === "identify") {
		screen = (
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
	} else if (state.step === "confirm") {
		screen = (
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
	} else if (state.step === "sending") {
		screen = (
			<KioskFrame label="Checking in">
				<p className="text-3xl font-semibold">Checking you in…</p>
			</KioskFrame>
		);
	} else if (state.step === "result") {
		screen = (
			<ResultScreen
				session={state.session}
				member={state.member}
				outcome={state.outcome}
				onDone={reset}
				onRetry={() => dispatch({ type: "retryCheckIn" })}
				onChooseClass={() => dispatch({ type: "changeSession" })}
			/>
		);
	} else {
		screen = (
			<HelpScreen
				kind={state.startWith === "staffHelp" ? "help" : "trial"}
				onBack={reset}
			/>
		);
	}

	return (
		<>
			{screen}
			<IdleWarning
				secondsLeft={idle.secondsLeft}
				onStillHere={idle.stillHere}
			/>
		</>
	);
}
