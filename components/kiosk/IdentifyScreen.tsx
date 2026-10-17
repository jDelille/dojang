import { ArrowLeft } from "lucide-react";
import KioskFrame from "./KioskFrame";

// the three ways to say who you are (from the docs: qr, pin, search)
const METHODS = [
	{ title: "Scan QR / pass", sub: "Fastest" },
	{ title: "Enter PIN", sub: "Member code" },
	{ title: "Search name", sub: "Manual lookup" },
];

export default function IdentifyScreen({ onBack }: { onBack: () => void }) {
	return (
		<KioskFrame label="Identify">
			{/* back button: calls the function the parent gave us */}
			<button
				onClick={onBack}
				className="mb-6 flex min-h-12 w-fit items-center gap-2 text-base text-kiosk-fg-secondary"
			>
				<ArrowLeft className="h-5 w-5" /> Back
			</button>

			<p className="font-mono text-xs uppercase tracking-[0.2em] text-kiosk-muted">
				Identify
			</p>
			<h1 className="mt-4 text-5xl font-bold tracking-tighter sm:text-6xl">
				Let&apos;s find your profile
			</h1>
			<p className="mt-3 text-lg text-kiosk-fg-secondary">
				Choose the easiest way to identify yourself.
			</p>

			<div className="mt-10 grid gap-4 sm:grid-cols-3">
				{METHODS.map((m) => (
					<button
						key={m.title}
						className="rounded-2xl border border-kiosk-line bg-kiosk-canvas px-6 py-7 text-left hover:bg-kiosk-interactive"
					>
						<span className="block text-xl font-semibold">{m.title}</span>
						<span className="mt-1 block text-base text-kiosk-fg-secondary">
							{m.sub}
						</span>
					</button>
				))}
			</div>

			<p className="mt-8 text-base text-kiosk-fg-secondary">
				No match? Ask staff for help.
			</p>
		</KioskFrame>
	);
}
