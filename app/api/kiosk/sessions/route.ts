import { odooRoute } from "@/lib/kiosk/server/odoo-runtime";

export const dynamic = "force-dynamic";

// today's classes, fetched from odoo on the server
export async function GET(request: Request) {
  return odooRoute(request, "sessions");
}
