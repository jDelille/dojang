import type { Role } from '@prisma/client';

/**
 * Role hierarchy (spec §4.9):
 *   Super Admin → Agency Admin → Workspace Admin → Staff
 * Higher rank implies every permission of the ranks below it.
 */
export const ROLE_RANK: Record<Role, number> = {
  super_admin: 40,
  agency_admin: 30,
  workspace_admin: 20,
  staff: 10,
};

export type Permission =
  | 'workspace:read'
  | 'workspace:write'
  | 'workspace:create'
  | 'team:manage'
  | 'integrations:manage'
  | 'billing:manage'
  | 'license:manage'
  | 'leads:read'
  | 'leads:write'
  | 'leads:gather'
  | 'contacts:write'
  | 'pipeline:write'
  | 'agents:write'
  | 'retention:write'
  | 'inbox:write'
  | 'appointments:write'
  | 'reviews:write'
  | 'invoices:write'
  | 'analytics:read'
  | 'platform:admin';

const STAFF: Permission[] = [
  'workspace:read',
  'leads:read',
  'leads:write',
  'contacts:write',
  'pipeline:write',
  'inbox:write',
  'appointments:write',
  'analytics:read',
];

const WORKSPACE_ADMIN: Permission[] = [
  ...STAFF,
  'workspace:write',
  'team:manage',
  'integrations:manage',
  'leads:gather',
  'agents:write',
  'retention:write',
  'reviews:write',
  'invoices:write',
];

const AGENCY_ADMIN: Permission[] = [...WORKSPACE_ADMIN, 'workspace:create', 'billing:manage'];

const SUPER_ADMIN: Permission[] = [...AGENCY_ADMIN, 'license:manage', 'platform:admin'];

const PERMISSIONS: Record<Role, Permission[]> = {
  staff: STAFF,
  workspace_admin: WORKSPACE_ADMIN,
  agency_admin: AGENCY_ADMIN,
  super_admin: SUPER_ADMIN,
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}

export function atLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  agency_admin: 'Agency Admin',
  workspace_admin: 'Workspace Admin',
  staff: 'Staff',
};

/** Roles a given role is allowed to assign to someone else. */
export function assignableRoles(role: Role): Role[] {
  const all: Role[] = ['super_admin', 'agency_admin', 'workspace_admin', 'staff'];
  return all.filter((r) => ROLE_RANK[r] <= ROLE_RANK[role]);
}
