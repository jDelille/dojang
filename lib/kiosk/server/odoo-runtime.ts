// server only: imports the gateway, which holds the kiosk keys. never import this from a client component.
import { configFrom, fail, handle, pair, type Operation } from "./odoo-gateway";
export const odooTestMode = () => process.env.DOJANG_INTEGRATION_MODE === "odoo-test";
export async function odooRoute(request: Request, operation: Operation, id?: string): Promise<Response> {
  try { return await handle(request, configFrom(process.env), operation, id); }
  catch { return fail("CAPABILITY_DISABLED"); }
}
export async function pairingRoute(request: Request): Promise<Response> {
  try { return await pair(request, configFrom(process.env)); }
  catch { return fail("CAPABILITY_DISABLED"); }
}
