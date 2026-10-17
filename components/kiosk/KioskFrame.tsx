"use client"; // has a live clock, which only works in the browser

import { useEffect, useState, type ReactNode } from "react";

// props = what each screen hands the frame
type Props = {
	label: string; // small section name next to the logo, e.g. "Arrival"
	children: ReactNode; // whatever the screen puts inside the frame
};

// shared frame: dark background, rounded panel, header with clock.
// every kiosk screen sits inside this
export default function KioskFrame({ label, children }: Props) {
	// null first so the server and browser agree (avoids a time mismatch error)
	const [now, setNow] = useState<Date | null>(null);

	useEffect(() => {
		setNow(new Date());
		const id = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(id); // stop ticking when the screen goes away
	}, []);

	return (
		<div className="min-h-screen bg-kiosk-canvas p-4 font-kiosk text-kiosk-fg sm:p-8">
			<div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col rounded-3xl border border-kiosk-line bg-kiosk-panel">
				{/* header: logo + section label on the left, clock on the right */}
				<header className="flex items-center justify-between border-b border-kiosk-line px-8 py-5">
					<span className="font-mono text-sm tracking-[0.25em]">
						DOJANG{" "}
						<span className="ml-3 text-kiosk-muted">{label.toUpperCase()}</span>
					</span>
					<span className="text-base tabular-nums text-kiosk-fg-secondary">
						{now?.toLocaleTimeString([], {
							hour: "numeric",
							minute: "2-digit",
						})}
					</span>
				</header>

				{/* each screen's own content goes here */}
				<main className="flex flex-1 flex-col justify-center px-8 py-10 sm:px-14">
					{children}
				</main>
			</div>
		</div>
	);
}
