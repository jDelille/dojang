import { pairingRoute } from "@/lib/kiosk/server/odoo-runtime";

// checks the pairing key and gives this device a kiosk cookie
export async function POST(request: Request) {
  return pairingRoute(request);
}
