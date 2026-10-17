"use client"; // keeps the typed digits in state

import { useState } from "react";
import { ArrowLeft, Delete } from "lucide-react";
import KioskFrame from "./KioskFrame";

const MAX = 6; // longest code we accept

export default function PinScreen({
	onBack,
	onSubmit,
}: {
	onBack: () => void;
	onSubmit: (code: string) => void;
}) {
	const [code, setCode] = useState(""); // digits typed so far

	// add a digit, but ignore it once we hit the max
	const press = (d: string) => setCode((c) => (c.length < MAX ? c + d : c));
	// remove the last digit
	const erase = () => setCode((c) => c.slice(0, -1));

	// one shared look for every key (min-h-20 = big touch target)
	const key =
		"flex min-h-20 items-center justify-center rounded-2xl border border-kiosk-line bg-kiosk-canvas text-3xl font-semibold hover:bg-kiosk-interactive active:bg-kiosk-interactive";

	return (
		<KioskFrame label="Identify">
			<button
				onClick={onBack}
				className="mb-6 flex min-h-12 w-fit items-center gap-2 text-base text-kiosk-fg-secondary"
			>
				<ArrowLeft className="h-5 w-5" /> Back
			</button>

			<h1 className="text-5xl font-bold tracking-tighter sm:text-6xl">
				Enter your PIN
			</h1>

			{/* shows dots instead of digits, so a passerby can't read the code */}
			<div className="mx-auto mt-8 flex min-h-16 w-full max-w-sm items-center justify-center rounded-2xl border border-kiosk-line bg-kiosk-canvas text-4xl tracking-[0.4em]">
				{code ? (
					"•".repeat(code.length)
				) : (
					<span className="text-kiosk-muted">PIN</span>
				)}
			</div>

			{/* number pad: 1-9, then a blank, 0, and erase */}
			<div className="mx-auto mt-6 grid w-full max-w-sm grid-cols-3 gap-3">
				{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
					<button key={d} onClick={() => press(d)} className={key}>
						{d}
					</button>
				))}
				<span />
				<button onClick={() => press("0")} className={key}>
					0
				</button>
				<button onClick={erase} aria-label="Erase" className={key}>
					<Delete className="h-7 w-7" />
				</button>
			</div>

			{/* disabled until at least 4 digits */}
			<button
				onClick={() => onSubmit(code)}
				disabled={code.length < 4}
				className="mx-auto mt-6 min-h-16 w-full max-w-sm rounded-2xl bg-kiosk-brand text-2xl font-semibold disabled:opacity-40"
			>
				Check in
			</button>
		</KioskFrame>
	);
}
