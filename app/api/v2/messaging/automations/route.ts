import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/messaging/automations — the dojo modules' Odoo rules and scheduled jobs, and whether this staff member may pause them. */
export const GET = hubRead('automation_overview', 'messaging.manage');
