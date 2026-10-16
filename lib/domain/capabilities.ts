import type { HubRole } from '@/lib/odoo-hub';

/**
 * What each hub role may do in the Staff Portal. These drive the UI (which
 * buttons show) and let a route refuse early; Odoo re-checks the grant and
 * record scope on every call, so this list can only narrow access, never widen
 * it. Guardians and members use the member app, not the Staff Portal.
 */
export type Capability =
  | 'classes.read'
  | 'attendance.mark'
  | 'members.read'
  | 'leads.read'
  | 'leads.write';

const INSTRUCTOR: Capability[] = ['classes.read', 'attendance.mark', 'members.read'];
const MANAGER: Capability[] = [...INSTRUCTOR, 'leads.read', 'leads.write'];

const BY_ROLE: Record<HubRole, readonly Capability[]> = {
  owner: MANAGER,
  manager: MANAGER,
  instructor: INSTRUCTOR,
  guardian: [],
  member: [],
};

export const capabilitiesFor = (role: HubRole): readonly Capability[] => BY_ROLE[role];

export const can = (role: HubRole, capability: Capability) => BY_ROLE[role].includes(capability);

export const isStaffRole = (role: HubRole) => BY_ROLE[role].length > 0;
