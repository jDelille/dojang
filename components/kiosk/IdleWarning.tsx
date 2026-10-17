"use client"; // moves focus, which only works in the browser

import { useEffect, useRef } from "react";

type Props = {
	secondsLeft: number | null; // null = not showing
	onStillHere: () => void;
};

// "Still there?" shown in the last seconds before the privacy reset
export default function IdleWarning({ secondsLeft, onStillHere }: Props) {
	const open = secondsLeft !== null;
	const button = useRef<HTMLButtonElement>(null);

	// move focus onto the button when the box appears (keyboards and screen readers)
	useEffect(() => {
		if (open) button.current?.focus();
	}, [open]);

	if (!open) return null;

	return (
		// fixed + inset-0 = covers the whole screen. the dark layer blocks taps on what is behind it
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 font-kiosk">
			<div
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="idle-title"
				aria-describedby="idle-body"
				className="w-full max-w-lg rounded-3xl border border-kiosk-line bg-kiosk-panel p-8 text-kiosk-fg"
			>
				<h2 id="idle-title" className="text-4xl font-bold tracking-tighter">
					Still there?
				</h2>
				<p id="idle-body" className="mt-3 text-lg text-kiosk-fg-secondary">
					The screen clears soon to keep your details private.
				</p>
				<p className="mt-4 text-2xl tabular-nums" aria-hidden="true">
					Clearing in {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}
				</p>
				<button
					ref={button}
					onClick={onStillHere}
					className="mt-6 min-h-16 w-full rounded-2xl bg-kiosk-brand text-2xl font-semibold"
				>
					I&apos;m still here
				</button>
			</div>
		</div>
	);
}
