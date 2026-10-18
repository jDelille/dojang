import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/**
 * POST /api/v2/messaging/automations/state — pause or resume one automation (owner only; Odoo checks).
 * payload: { automationId: "ir.cron:12" | "base.automation:3", active, reason }; expectedVersion is the automation's.
 * The id is not numeric, so it travels in the payload rather than the path.
 */
export const POST = hubWrite('set_automation_active', 'messaging.manage');
