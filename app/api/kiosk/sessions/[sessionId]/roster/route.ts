import { odooRoute } from "@/lib/kiosk/server/odoo-runtime";

export const dynamic = "force-dynamic";

// the students registered for one class
export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  return odooRoute(request, "roster", sessionId);
}
