import { odooRoute } from "@/lib/kiosk/server/odoo-runtime";

// sends one check-in to odoo
export async function POST(request: Request) {
  return odooRoute(request, "checkin");
}
