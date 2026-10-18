import KioskFrame from "./KioskFrame";
import { DEMO_EVENTS } from "@/lib/kiosk/demo";

type Props = { onBack: () => void };

// read-only list of what's coming up. no signup from the kiosk yet
export default function EventsScreen({ onBack }: Props) {
	return (
		<KioskFrame label="Events">
			<p className="font-mono text-xs uppercase tracking-[0.2em] text-kiosk-muted">
				Events
			</p>
			<h1 className="mt-4 text-5xl font-bold tracking-tighter">
				What's coming up
			</h1>

			<ul className="mt-8 space-y-3">
				{DEMO_EVENTS.map((e) => (
					<li
						key={e.id}
						className="rounded-2xl border border-kiosk-line bg-kiosk-canvas px-6 py-5"
					>
						<p className="text-xl font-semibold">{e.title}</p>
						<p className="mt-1 font-mono text-sm text-kiosk-fg-secondary">
							{e.when}
						</p>
						<p className="mt-1 text-kiosk-muted">{e.note}</p>
					</li>
				))}
			</ul>

			<button
				onClick={onBack}
				className="mt-8 min-h-14 rounded-2xl border border-kiosk-line px-8 text-lg"
			>
				Back
			</button>
		</KioskFrame>
	);
}
