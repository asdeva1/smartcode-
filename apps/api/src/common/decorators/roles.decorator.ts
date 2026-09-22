import { SetMetadata } from '@nestjs/common';
import type { Role } from '@smartcode/types';

export const ROLES_KEY = 'roles';

/**
 * Coarse (route-level) RBAC check — see docs/03-RBAC-PERMISSIONS.md
 * "Enforcement Model". This decides whether a role can hit an endpoint
 * at all; row-level scoping (which team, which own record) is enforced
 * separately in each service.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
