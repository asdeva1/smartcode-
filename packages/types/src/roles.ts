/**
 * Canonical role set — see docs/03-RBAC-PERMISSIONS.md
 * This is the single source of truth for role names across
 * the Prisma schema, NestJS guards, and the Next.js UI.
 */
export const ROLES = ['MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Account creation hierarchy — see docs/03-RBAC-PERMISSIONS.md
 * "Hierarchy Enforcement" section. Maps a creating role to the
 * set of roles it is permitted to create.
 *
 * MANAGER creates TEAM_LEAD, AUDITOR.
 * TEAM_LEAD creates CODER.
 * CODER and AUDITOR create no one.
 */
export const CREATION_HIERARCHY: Record<Role, Role[]> = {
  MANAGER: ['TEAM_LEAD', 'AUDITOR'],
  TEAM_LEAD: ['CODER'],
  CODER: [],
  AUDITOR: [],
};

export function canCreateRole(creatorRole: Role, targetRole: Role): boolean {
  return CREATION_HIERARCHY[creatorRole]?.includes(targetRole) ?? false;
}
