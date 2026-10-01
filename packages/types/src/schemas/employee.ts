import type { Role } from '../roles';

/**
 * Employee Directory (docs/09-BUSINESS-RULES.md section 11 / Phase 9) -
 * Manager-only, enterprise-wide account directory. Not a CRM/ATS - just a
 * searchable, paginated view of every account in SmartCode. Presence
 * (online/offline) is intentionally omitted: no UserSession/presence
 * model exists yet, and this phase does not invent fake values for it.
 */
export interface EmployeeRow {
  id: string;
  employeeId: string;
  fullName: string | null;
  loginName: string;
  email: string;
  role: Role;
  isActive: boolean;
  vendor: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  teamLead: { id: string; fullName: string | null; loginName: string } | null;
  // Organization Assignment + Auto-Visibility requirement section 8 -
  // null for MANAGER (enterprise-wide scope, not a per-project
  // assignment); an array (possibly empty) for every other role.
  assignedProjects: { id: string; name: string }[] | null;
  createdAt: string;
}

export interface EmployeeListResponse {
  data: EmployeeRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EmployeeDetail extends EmployeeRow {
  loginNameHistory: {
    id: string;
    loginName: string;
    status: string;
    allocatedAt: string;
    deallocatedAt: string | null;
  }[];
}
