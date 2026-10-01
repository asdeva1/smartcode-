/**
 * "Organization Assignment + Auto-Visibility" requirement - the shape
 * returned by `GET /me/context`. The backend is the single source of
 * truth for a user's current authorized Vendor/Team/Team Lead/Project(s);
 * every role's dashboard/workspace consumes this instead of asking the
 * user to re-select something they are already assigned to (see
 * apps/api/src/modules/org-context/org-context.service.ts).
 */
export type OrgContextRef = { id: string; name: string };
export type OrgContextPersonRef = { id: string; fullName: string | null; loginName: string };
export type OrgContextProjectRef = { id: string; name: string; client?: OrgContextRef | null; allocationType?: 'MANUAL' | 'AUTOMATIC' };

export interface ManagerOrgContext {
  role: 'MANAGER';
  scope: 'ENTERPRISE';
}

export interface CoderOrgContext {
  role: 'CODER';
  vendor: OrgContextRef | null;
  team: OrgContextRef | null;
  teamLead: OrgContextPersonRef | null;
  projects: OrgContextProjectRef[];
}

export interface TeamLeadOrgContext {
  role: 'TEAM_LEAD';
  vendor: OrgContextRef | null;
  teams: OrgContextRef[];
  projects: OrgContextProjectRef[];
  coderCount: number;
  teamMembers: { id: string; fullName: string | null; loginName: string; employeeId: string }[];
}

export interface AuditorOrgContext {
  role: 'AUDITOR';
  vendor: OrgContextRef | null;
  projects: OrgContextProjectRef[];
  clients: OrgContextRef[];
}

export interface VendorOrgContext {
  role: 'VENDOR';
  vendor: { id: string; name: string; code: string; isActive: boolean } | null;
  teams: OrgContextRef[];
  teamLeads: OrgContextPersonRef[];
  auditors: OrgContextPersonRef[];
  coderCount: number;
  projects: OrgContextProjectRef[];
  activeUsers: number;
}

export type OrgContext = ManagerOrgContext | CoderOrgContext | TeamLeadOrgContext | AuditorOrgContext | VendorOrgContext;
