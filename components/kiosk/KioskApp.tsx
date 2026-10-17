"use client"; // uses state and effects, which only work in the browser

import { useEffect, useReducer } from "react";
import {
	checkInFlowReducer,
	initialCheckInFlow,
} from "@/lib/kiosk/domain/kiosk/checkInFlow";
import { getRoster, listSessions } from "@/lib/kiosk/demo";
import KioskFrame from "./KioskFrame";
import WelcomeScreen from "./WelcomeScreen";
import ClassesScreen from "./ClassesScreen";
import IdentifyScreen from "./IdentifyScreen";

export default function KioskApp() {
	// the reducer decides the next step. screens only say what happened (dispatch)
	const [state, dispatch] = useReducer(checkInFlowReducer, initialCheckInFlow);

	// on the class step with the list still "loading": fetch it, then report back
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

	// on the identify step with the roster still "loading": fetch it, then report back
	const rosterSessionId =
		state.step === "identify" && state.roster.status === "loading"
			? state.session.sessionId
			: null;
	useEffect(() => {
		if (!rosterSessionId) return;
		let cancelled = false; // ignore the answer if we left this step meanwhile
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

	// steps we have not built yet: identify, confirm, sending, result, concierge
	return (
		<KioskFrame label={state.step}>
			<p className="text-3xl font-semibold">
				&quot;{state.step}&quot; screen coming next
			</p>
			<button
				onClick={() => dispatch({ type: "reset" })}
				className="mt-8 min-h-12 w-fit rounded-2xl border border-kiosk-line px-6 text-lg"
			>
				Start over
			</button>
		</KioskFrame>
	);
}
