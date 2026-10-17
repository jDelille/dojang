import { hubRead } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/reports/operations?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD — school-wide attendance, workload, belts and families (up to 31 days). Odoo allows managers and owners only. */
export const GET = hubRead('operations_report', 'reports.read');
