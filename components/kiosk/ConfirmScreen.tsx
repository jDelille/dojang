import { ArrowLeft } from "lucide-react";
import KioskFrame from "./KioskFrame";
import type {
	RosterMember,
	SessionOption,
} from "@/lib/kiosk/contracts/kiosk-attendance";
import { formatStartTime } from "@/lib/kiosk/domain/kiosk/sessionFormat";

type Props = {
	session: SessionOption;
	member: RosterMember;
	onConfirm: () => void;
	onBack: () => void;
};

export default function ConfirmScreen({
	session,
	member,
	onConfirm,
	onBack,
}: Props) {
	const t = formatStartTime(session.startsAt, session.timeZone);

	return (
		<KioskFrame label="Confirm">
			<button
				onClick={onBack}
				className="mb-6 flex min-h-12 w-fit items-center gap-2 text-base text-kiosk-fg-secondary"
			>
				<ArrowLeft className="h-5 w-5" /> Not you? Go back
			</button>

			<p className="font-mono text-xs uppercase tracking-[0.2em] text-kiosk-muted">
				Check in
			</p>
			<h1 className="mt-4 text-5xl font-bold tracking-tighter sm:text-6xl">
				Is this you?
			</h1>

			{/* dl = a list of label + value pairs */}
			<dl className="mt-8 grid grid-cols-[8rem_1fr] gap-y-3 rounded-2xl border border-kiosk-line bg-kiosk-canvas p-6 text-xl">
				<dt className="text-kiosk-muted">Student</dt>
				<dd className="font-semibold">{member.displayName}</dd>
				<dt className="text-kiosk-muted">Class</dt>
				<dd className="font-semibold">
					{session.title} · {t.time} {t.period}
				</dd>
			</dl>

			<button
				onClick={onConfirm}
				className="mt-8 min-h-20 w-full rounded-2xl bg-kiosk-brand text-3xl font-semibold"
			>
				Confirm check-in
			</button>
		</KioskFrame>
	);
}
