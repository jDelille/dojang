import KioskFrame from "./KioskFrame";

type Props = { onBack: () => void };

// get help: no ai, no backend. just points people to the front desk
export default function HelpScreen({ onBack }: Props) {
	return (
		<KioskFrame label="Help">
			<p className="font-mono text-xs uppercase tracking-[0.2em] text-kiosk-muted">
				Help
			</p>
			<h1 className="mt-4 text-5xl font-bold tracking-tighter">
				Please see the front desk
			</h1>
			<p className="mt-3 text-lg text-kiosk-fg-secondary">
				A staff member will be happy to help you.
			</p>
			<button
				onClick={onBack}
				className="mt-10 min-h-14 rounded-2xl bg-kiosk-brand px-8 text-lg font-semibold text-white"
			>
				Done
			</button>
		</KioskFrame>
	);
}
