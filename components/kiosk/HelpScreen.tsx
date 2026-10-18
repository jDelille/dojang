import KioskFrame from "./KioskFrame";

type Props = {
	kind: "help" | "trial"; // which message to show
	onBack: () => void;
};

// the text for each kind. no ai, no backend: both point to the front desk
const COPY = {
	help: {
		label: "Help",
		title: "Please see the front desk",
		sub: "A staff member will be happy to help you.",
	},
	trial: {
		label: "Book a trial",
		title: "Welcome! Try a free class",
		sub: "Please see the front desk and we'll get you started.",
	},
};

export default function HelpScreen({ kind, onBack }: Props) {
	const c = COPY[kind];
	return (
		<KioskFrame label={c.label}>
			<p className="font-mono text-xs uppercase tracking-[0.2em] text-kiosk-muted">
				{c.label}
			</p>
			<h1 className="mt-4 text-5xl font-bold tracking-tighter">{c.title}</h1>
			<p className="mt-3 text-lg text-kiosk-fg-secondary">{c.sub}</p>
			<button
				onClick={onBack}
				className="mt-10 min-h-14 rounded-2xl bg-kiosk-brand px-8 text-lg font-semibold text-white"
			>
				Done
			</button>
		</KioskFrame>
	);
}
