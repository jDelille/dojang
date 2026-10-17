import { ArrowRight } from "lucide-react";
import KioskFrame from "./KioskFrame";

type Props = {
	onCheckIn: () => void; // starts the session-first journey: pick a class first
	onHelp: () => void;
	onTrial: () => void;
	onEvents: () => void;
};

type Card = {
	title: string;
	sub: string;
	primary?: boolean; // the red main action
	wide?: boolean; // spans both columns
	enabled: boolean; // false = shown, but dimmed and not tappable until its screen exists
};

// the home cards, merged from both of paul's docs
const CARDS: Card[] = [
	{
		title: "Check in",
		sub: "Find your class and check in",
		primary: true,
		wide: true,
		enabled: true,
	},
	{ title: "Classes", sub: "See today's sessions", enabled: true }, // same journey as check in
	{ title: "Events", sub: "What's coming up", enabled: true },
	{ title: "Book a trial", sub: "New here? Try a class", enabled: true },
	{ title: "Get help", sub: "Talk to a staff member", enabled: true },
];

export default function WelcomeScreen({
	onCheckIn,
	onHelp,
	onTrial,
	onEvents,
}: Props) {
	return (
		<KioskFrame label="Arrival">
			<p className="font-mono text-xs uppercase tracking-[0.2em] text-kiosk-muted">
				Arrival
			</p>
			<h1 className="mt-4 text-5xl font-bold tracking-tighter sm:text-6xl">
				Welcome to Dojang
			</h1>
			<p className="mt-3 text-lg text-kiosk-fg-secondary">
				What would you like to do today?
			</p>

			<div className="mt-10 grid gap-4 sm:grid-cols-2">
				{CARDS.map((c) => (
					<button
						key={c.title}
						onClick={
							c.title === "Get help"
								? onHelp
								: c.title === "Book a trial"
									? onTrial
									: c.title === "Events"
										? onEvents
										: onCheckIn
						}
						disabled={!c.enabled} // a disabled button ignores taps and is announced as unavailable
						className={`flex items-center justify-between rounded-2xl border px-6 py-7 text-left transition-colors ${
							c.wide ? "sm:col-span-2" : ""
						} ${
							c.primary
								? "border-kiosk-brand bg-kiosk-brand"
								: "border-kiosk-line bg-kiosk-canvas enabled:hover:bg-kiosk-interactive enabled:active:bg-kiosk-interactive"
						} ${c.enabled ? "" : "cursor-not-allowed opacity-50"}`}
					>
						<span>
							<span className="block text-2xl font-semibold">{c.title}</span>
							<span
								className={`mt-1 block text-base ${c.primary ? "text-white/85" : "text-kiosk-fg-secondary"}`}
							>
								{c.sub}
							</span>
						</span>
						{c.enabled ? (
							<ArrowRight className="h-7 w-7 shrink-0" />
						) : (
							<span className="shrink-0 font-mono text-xs uppercase tracking-[0.15em] text-kiosk-muted">
								Coming soon
							</span>
						)}
					</button>
				))}
			</div>

			{/* plain text, not a button, so it can never be a dead tap */}
			<p className="mt-8 text-base text-kiosk-muted">
				Need help? Please ask a staff member.
			</p>
		</KioskFrame>
	);
}
