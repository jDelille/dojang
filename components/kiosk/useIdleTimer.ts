"use client";

import { useEffect, useRef, useState } from "react";

type Options = {
	active: boolean; // the timer only runs while this is true
	restartKey: string; // changing it (e.g. moving to a new step) restarts the timer
	timeoutSeconds: number;
	warningSeconds: number;
	onTimeout: () => void;
};

// touches, keys and typing all count as "someone is here"
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "input"] as const;

// Privacy idle timer (K07). ported from justin's old kiosk, with useEffectEvent
// swapped for a ref because next 15 ships a react without it
export function useIdleTimer({
	active,
	restartKey,
	timeoutSeconds,
	warningSeconds,
	onTimeout,
}: Options) {
	const lastActivityAt = useRef(0);
	const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

	// always remember the newest onTimeout, so the timer below never calls a stale one
	const timeoutRef = useRef(onTimeout);
	useEffect(() => {
		timeoutRef.current = onTimeout;
	});

	// "I'm still here": count as activity and hide the warning
	const stillHere = () => {
		lastActivityAt.current = Date.now();
		setSecondsLeft(null);
	};

	useEffect(() => {
		if (!active) return;

		lastActivityAt.current = Date.now();
		const recordActivity = () => {
			lastActivityAt.current = Date.now();
		};
		// capture = true so we see the touch even if a button stops it from bubbling
		for (const eventName of ACTIVITY_EVENTS) {
			window.addEventListener(eventName, recordActivity, true);
		}

		// check 4 times a second how long it has been quiet
		const tick = setInterval(() => {
			const idleSeconds = (Date.now() - lastActivityAt.current) / 1000;
			const remaining = timeoutSeconds - idleSeconds;

			if (remaining <= 0) {
				clearInterval(tick);
				setSecondsLeft(null);
				timeoutRef.current(); // time is up: clear everything
				return;
			}
			// show the countdown only in the last few seconds
			setSecondsLeft(remaining <= warningSeconds ? Math.ceil(remaining) : null);
		}, 250);

		return () => {
			clearInterval(tick);
			for (const eventName of ACTIVITY_EVENTS) {
				window.removeEventListener(eventName, recordActivity, true);
			}
		};
	}, [active, restartKey, timeoutSeconds, warningSeconds]);

	return {
		secondsLeft: active ? secondsLeft : null,
		stillHere,
	};
}
