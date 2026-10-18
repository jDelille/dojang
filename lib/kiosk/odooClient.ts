import type {
  CheckInResult,
  ProblemDetails,
  RosterMember,
  SessionOption,
} from "@/lib/kiosk/contracts/kiosk-attendance";
import type { CheckInCommand } from "@/lib/kiosk/domain/kiosk/checkInCommand";
import type { CheckInAnswer } from "@/lib/kiosk/domain/kiosk/checkInOutcome";
import { CHECK_IN_TIMEOUT_SECONDS } from "@/lib/kiosk/domain/kiosk/kioskConfig";

// the real data source: calls our own /api/kiosk routes, which talk to odoo.
// same function names and shapes as demo.ts, so no screen has to change.

export async function listSessions(): Promise<SessionOption[]> {
  const response = await fetch("/api/kiosk/sessions", { cache: "no-store" });
  if (!response.ok) throw new Error(`sessions failed (${response.status})`);
  return response.json();
}

export async function getRoster(sessionId: string): Promise<RosterMember[]> {
  const response = await fetch(
    `/api/kiosk/sessions/${encodeURIComponent(sessionId)}/roster`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(`roster failed (${response.status})`);
  return response.json();
}

// never throws: anything we can't trust as a reply counts as "noAnswer" (not confirmed).
// a retry reuses the same command and idempotency key, so it can't record twice.
export async function submitCheckIn(
  command: CheckInCommand,
): Promise<CheckInAnswer> {
  let response: Response;
  try {
    response = await fetch("/api/kiosk/check-ins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_IN_TIMEOUT_SECONDS * 1000),
    });
  } catch {
    return { kind: "noAnswer" }; // offline or timed out
  }

  const body = await response.json().catch(() => null);

  if (response.ok && typeof body?.receipt?.attendanceId === "string") {
    return { kind: "result", result: body as CheckInResult };
  }
  if (!response.ok && typeof body?.code === "string") {
    return { kind: "problem", problem: body as ProblemDetails };
  }
  return { kind: "noAnswer" };
}
