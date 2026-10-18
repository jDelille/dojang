// the only file the kiosk screens import data from.
// demo data by default. set NEXT_PUBLIC_KIOSK_SOURCE=odoo in .env.local for real odoo.
import * as demo from "./demo";
import * as odoo from "./odooClient";

const live = process.env.NEXT_PUBLIC_KIOSK_SOURCE === "odoo";

export const listSessions = live ? odoo.listSessions : demo.listSessions;
export const getRoster = live ? odoo.getRoster : demo.getRoster;
export const submitCheckIn = live ? odoo.submitCheckIn : demo.submitCheckIn;
