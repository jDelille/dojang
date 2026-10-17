"use client"; // uses state + a live clock, which only work in the browser

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

// home cards, merged from both of paul's docs.
// primary = the red main action. wide = spans both columns
const CARDS = [
	{
		title: "Check in",
		sub: "Scan your QR pass, enter your PIN, or search your name",
		primary: true,
		wide: true,
	},
	{ title: "Classes", sub: "See today's sessions" },
	{ title: "Events", sub: "What's coming up" },
	{ title: "Book a trial", sub: "New here? Try a class" },
	{ title: "Get help", sub: "Talk to a staff member" },
];

export default function KioskWelcome() {
	// null first so the server and browser agree (avoids a time mismatch error)
	const [now, setNow] = useState<Date | null>(null);

	useEffect(() => {
		setNow(new Date());
		const id = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(id); // stop ticking when the screen goes away
	}, []);

	return (
		// outer layer: full-screen dark background, apple system font
		<div className="min-h-screen bg-kiosk-canvas p-4 font-kiosk text-kiosk-fg sm:p-8">
			{/* the frame: one rounded bordered panel, centered and narrow */}
			<div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col rounded-3xl border border-kiosk-line bg-kiosk-panel">
				{/* header strip: name + clock */}
				<header className="flex items-center justify-between border-b border-kiosk-line px-8 py-5">
					<span className="font-mono text-sm tracking-[0.25em]">DOJANG</span>
					<span className="text-base tabular-nums text-kiosk-fg-secondary">
						{now?.toLocaleTimeString([], {
							hour: "numeric",
							minute: "2-digit",
						})}
					</span>
				</header>

				<main className="flex flex-1 flex-col justify-center px-8 py-10 sm:px-14">
					<p className="font-mono text-xs uppercase tracking-[0.2em] text-kiosk-muted">
						{now?.toLocaleDateString([], {
							weekday: "long",
							month: "short",
							day: "numeric",
						})}
					</p>
					<h1 className="mt-4 text-5xl font-bold tracking-tighter sm:text-6xl">
						Welcome to Dojang
					</h1>
					<p className="mt-3 text-lg text-kiosk-fg-secondary">
						What would you like to do today?
					</p>

					{/* card grid: check in on top (full width), the rest in two columns */}
					<div className="mt-10 grid gap-4 sm:grid-cols-2">
						{CARDS.map((c) => (
							<button
								key={c.title}
								className={`flex items-center justify-between rounded-2xl border px-6 py-7 text-left transition-colors ${
									c.wide ? "sm:col-span-2" : ""
								} ${
									c.primary
										? "border-kiosk-brand bg-kiosk-brand"
										: "border-kiosk-line bg-kiosk-canvas hover:bg-kiosk-interactive active:bg-kiosk-interactive"
								}`}
							>
								<span>
									<span className="block text-2xl font-semibold">
										{c.title}
									</span>
									<span
										className={`mt-1 block text-base ${c.primary ? "text-white/85" : "text-kiosk-fg-secondary"}`}
									>
										{c.sub}
									</span>
								</span>
								<ArrowRight className="h-7 w-7 shrink-0" />
							</button>
						))}
					</div>

					{/* footer row: min-h-12 keeps every tap target large. violet = ai only */}
					<div className="mt-8 flex flex-wrap items-center gap-3 text-base text-kiosk-fg-secondary">
						<button className="min-h-12 rounded-full border border-kiosk-agent/50 px-6 font-medium text-kiosk-agent">
							Talk to Companion
						</button>
						<button className="min-h-12 px-4">Language</button>
						<button className="min-h-12 px-4">Accessibility</button>
					</div>
				</main>
			</div>
		</div>
	);
}
