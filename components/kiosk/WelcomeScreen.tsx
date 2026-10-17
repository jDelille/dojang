import { ArrowRight } from "lucide-react";
import KioskFrame from "@/components/kiosk/KioskFrame";

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

export default function WelcomeScreen({
	onCheckIn,
}: {
	onCheckIn: () => void;
}) {
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
						onClick={c.title === "Check in" ? onCheckIn : undefined}
						className={`flex items-center justify-between rounded-2xl border px-6 py-7 text-left transition-colors ${
							c.wide ? "sm:col-span-2" : ""
						} ${
							c.primary
								? "border-kiosk-brand bg-kiosk-brand"
								: "border-kiosk-line bg-kiosk-canvas hover:bg-kiosk-interactive active:bg-kiosk-interactive"
						}`}
					>
						<span>
							<span className="block text-2xl font-semibold">{c.title}</span>
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

			<div className="mt-8 flex flex-wrap items-center gap-3 text-base text-kiosk-fg-secondary">
				<button className="min-h-12 rounded-full border border-kiosk-agent/50 px-6 font-medium text-kiosk-agent">
					Talk to Companion
				</button>
				<button className="min-h-12 px-4">Language</button>
				<button className="min-h-12 px-4">Accessibility</button>
			</div>
		</KioskFrame>
	);
}
