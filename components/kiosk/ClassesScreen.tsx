import { ArrowLeft, ArrowRight } from "lucide-react";
import KioskFrame from "./KioskFrame";
import type { SessionOption } from "@/lib/kiosk/contracts/kiosk-attendance";
import type { SessionsLoad } from "@/lib/kiosk/domain/kiosk/checkInFlow";
import {
	formatDuration,
	formatStartTime,
	sessionsInTimeOrder,
} from "@/lib/kiosk/domain/kiosk/sessionFormat";

type Props = {
	sessions: SessionsLoad; // loading, ready (with a list) or unavailable
	onPick: (session: SessionOption) => void;
	onBack: () => void;
	onRetry: () => void;
};

export default function ClassesScreen({
	sessions,
	onPick,
	onBack,
	onRetry,
}: Props) {
	return (
		<KioskFrame label="Classes">
			<button
				onClick={onBack}
				className="mb-6 flex min-h-12 w-fit items-center gap-2 text-base text-kiosk-fg-secondary"
			>
				<ArrowLeft className="h-5 w-5" /> Back
			</button>

			<p className="font-mono text-xs uppercase tracking-[0.2em] text-kiosk-muted">
				Today
			</p>
			<h1 className="mt-4 text-5xl font-bold tracking-tighter sm:text-6xl">
				Choose your class
			</h1>
			<p className="mt-3 text-lg text-kiosk-fg-secondary">
				Pick the class you are here for.
			</p>

			<div className="mt-8 space-y-3">
				{/* loading: gray pulsing placeholders */}
				{sessions.status === "loading" &&
					[1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-24 animate-pulse rounded-2xl bg-kiosk-canvas"
						/>
					))}

				{/* failed: say so, offer a retry. never claim there are no classes */}
				{sessions.status === "unavailable" && (
					<div className="rounded-2xl border border-kiosk-line bg-kiosk-canvas p-6">
						<p className="text-lg">
							We can&apos;t load today&apos;s classes right now.
						</p>
						<button
							onClick={onRetry}
							className="mt-4 min-h-12 rounded-2xl bg-kiosk-brand px-6 text-lg font-semibold"
						>
							Try again
						</button>
					</div>
				)}

				{sessions.status === "ready" && sessions.list.length === 0 && (
					<p className="text-lg text-kiosk-fg-secondary">No classes today.</p>
				)}

				{/* ready: one card per class, earliest first. full classes stay tappable (registered students still check in) */}
				{sessions.status === "ready" &&
					sessionsInTimeOrder(sessions.list).map((s) => {
						const t = formatStartTime(s.startsAt, s.timeZone);
						return (
							<button
								key={s.sessionId}
								onClick={() => onPick(s)}
								className="flex w-full items-center gap-6 rounded-2xl border border-kiosk-line bg-kiosk-canvas px-6 py-5 text-left transition-colors hover:bg-kiosk-interactive active:bg-kiosk-interactive"
							>
								<span className="w-24 shrink-0">
									<span className="block text-2xl font-semibold tabular-nums">
										{t.time}
									</span>
									<span className="text-sm text-kiosk-muted">{t.period}</span>
								</span>
								<span className="flex-1">
									<span className="block text-xl font-semibold">{s.title}</span>
									<span className="block text-base text-kiosk-fg-secondary">
										{formatDuration(s.startsAt, s.endsAt)} ·{" "}
										{s.instructor ?? "Instructor to be confirmed"}
									</span>
								</span>
								<span className="text-base tabular-nums text-kiosk-fg-secondary">
									{s.seatsTaken} / {s.capacity}
								</span>
								<ArrowRight className="h-6 w-6 shrink-0" />
							</button>
						);
					})}
			</div>
		</KioskFrame>
	);
}
