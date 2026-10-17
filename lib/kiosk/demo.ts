// demo data so the kiosk runs with no backend. same shapes as the contract,
// so the real odoo calls can replace these functions later without touching screens
import type {
	RosterMember,
	SessionOption,
} from "@/lib/kiosk/contracts/kiosk-attendance";
import type { CheckInCommand } from "@/lib/kiosk/domain/kiosk/checkInCommand";
import type { CheckInAnswer } from "@/lib/kiosk/domain/kiosk/checkInOutcome";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms)); // fake network delay

// a time today at hour h and minute m, as an iso string
const at = (h: number, m = 0) => {
	const d = new Date();
	d.setHours(h, m, 0, 0);
	return d.toISOString();
};

const session = (
	id: string,
	title: string,
	start: [number, number?],
	end: [number, number?],
	capacity: number,
	seatsTaken: number,
): SessionOption => ({
	sessionId: id,
	title,
	startsAt: at(...start),
	endsAt: at(...end),
	version: 1,
	capacity,
	seatsTaken,
	instructor: null,
});

export const DEMO_SESSIONS: SessionOption[] = [
	session("101", "Little Dragons", [16], [16, 45], 12, 8),
	session("102", "Junior Taekwondo", [17], [18], 25, 24),
	session("103", "Children Advanced", [17, 45], [18, 45], 16, 1),
	session("104", "Adult Taekwondo", [18, 30], [19, 30], 30, 13),
];

const person = (memberId: string, displayName: string): RosterMember => ({
	memberId,
	displayName,
	enrollmentStatus: "registered",
	attendanceState: "pending",
});

// who is registered for each class (display names are first name + last initial)
const ROSTERS: Record<string, RosterMember[]> = {
	"101": [person("4", "Mia R."), person("5", "Noah T.")],
	"102": [
		person("1", "Mason L."),
		person("2", "Ava J."),
		person("3", "Ben K."),
	],
	"103": [person("4", "Mia R.")],
	"104": [person("6", "Ella S."), person("7", "Owen P.")],
};

export async function listSessions(): Promise<SessionOption[]> {
	await wait(400);
	return DEMO_SESSIONS;
}

export async function getRoster(sessionId: string): Promise<RosterMember[]> {
	await wait(400);
	return ROSTERS[sessionId] ?? [];
}

// pretend to be the backend. member 2 (Ava) is "on hold" so we can test the refusal screen
export async function submitCheckIn(
	command: CheckInCommand,
): Promise<CheckInAnswer> {
	await wait(500);
	const { memberId, sessionId } = command.payload;

	if (memberId === "2") {
		return {
			kind: "problem",
			problem: {
				type: "demo",
				title: "Needs review",
				status: 403,
				code: "ELIGIBILITY_REVIEW_REQUIRED",
				detail: "demo",
				correlationId: command.correlationId,
			},
		};
	}

	// more than 10 minutes after the class started = late
	const cls = DEMO_SESSIONS.find((s) => s.sessionId === sessionId);
	const now = new Date();
	const late = !!cls && now.getTime() - Date.parse(cls.startsAt) > 10 * 60_000;

	return {
		kind: "result",
		result: {
			replayed: false,
			correlationId: command.correlationId,
			receipt: {
				attendanceId: `demo-${Date.now()}`,
				memberId,
				sessionId,
				checkedInAt: now.toISOString(),
				status: late ? "late" : "present",
				alreadyRecorded: false,
				correlationId: command.correlationId,
			},
		},
	};
}
