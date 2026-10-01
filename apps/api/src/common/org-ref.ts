/**
 * Shared "where is this account placed in the org" resolution
 * (docs/09-BUSINESS-RULES.md sections 10/11 / Phase 9) - reused by
 * LoginNameAllocationService and EmployeesService so both screens agree
 * on what "Vendor"/"Team"/"Team Lead" mean for every role, rather than
 * two slightly different join shapes drifting apart.
 *
 * - Vendor: a CODER/VENDOR-role account carries `vendorId` directly; a
 *   TEAM_LEAD/AUDITOR's vendor affiliation is tracked with history via
 *   VendorAssignment instead (see users.service.ts's ACTIVE_VENDOR_INCLUDE) -
 *   so this checks the direct relation first, then the active assignment.
 * - Team: a CODER's team is `teamId`/`team`; a TEAM_LEAD's team is the one
 *   they lead (`leadsTeam`), not `teamId` (which a Team Lead does not
 *   carry). Every other role has no team.
 * - Team Lead: whoever leads the resolved team, if any.
 */
// PROJECT_REF_SELECT is added for the Organization Assignment +
// Auto-Visibility requirement (section 8 - Manager Employee Directory
// "Assigned Project(s)" column). Only ACTIVE assignments/projects are
// selected - a Coder/Auditor's ended project involvement is history, not
// a current assignment, and the Directory must show current context (see
// orgProjectsRef below).
const PROJECT_REF_SELECT = { id: true, name: true } as const;

export const ORG_USER_SELECT = {
  id: true,
  fullName: true,
  employeeId: true,
  loginName: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  vendor: { select: { id: true, name: true } },
  team: {
    select: {
      id: true,
      name: true,
      teamLead: { select: { id: true, fullName: true, loginName: true } },
      projects: { where: { isActive: true }, select: PROJECT_REF_SELECT, orderBy: { name: 'asc' } },
    },
  },
  leadsTeam: {
    select: {
      id: true,
      name: true,
      teamLead: { select: { id: true, fullName: true, loginName: true } },
      projects: { where: { isActive: true }, select: PROJECT_REF_SELECT, orderBy: { name: 'asc' } },
    },
  },
  vendorAssignments: { where: { isActive: true }, select: { vendor: { select: { id: true, name: true } } }, take: 1 },
  // AUDITOR-only in practice (a non-Auditor has none), but selected
  // unconditionally - Prisma requires a static select shape and every
  // other relation here follows the same "select for every role, only
  // some roles' rows populate it" pattern (e.g. leadsTeam).
  auditorAssignments: { where: { isActive: true }, select: { project: { select: PROJECT_REF_SELECT } }, orderBy: { assignedAt: 'desc' } },
} as const;

type OrgUser = {
  role: string;
  vendor?: { id: string; name: string } | null;
  vendorAssignments?: { vendor: { id: string; name: string } }[];
  team?: { id: string; name: string; teamLead: { id: string; fullName: string | null; loginName: string } | null; projects?: { id: string; name: string }[] } | null;
  leadsTeam?: { id: string; name: string; teamLead: { id: string; fullName: string | null; loginName: string } | null; projects?: { id: string; name: string }[] } | null;
  auditorAssignments?: { project: { id: string; name: string } }[];
};

export function orgVendorRef(u: OrgUser) {
  return u.vendor ?? u.vendorAssignments?.[0]?.vendor ?? null;
}

export function orgTeamRef(u: OrgUser) {
  return u.role === 'TEAM_LEAD' ? (u.leadsTeam ?? null) : (u.team ?? null);
}

export function orgTeamLeadRef(u: OrgUser) {
  return orgTeamRef(u)?.teamLead ?? null;
}

/**
 * Currently-assigned Project(s) - Coder/Team Lead: their Team's active
 * Projects; Auditor: their active AuditorProjectAssignment rows; Manager/
 * Vendor: not resolvable from a single User row (a Manager has enterprise
 * scope; a Vendor's projects span every Team under it) - callers resolve
 * those two roles separately (see EmployeesService/OrgContextService).
 */
export function orgProjectsRef(u: OrgUser): { id: string; name: string }[] {
  if (u.role === 'AUDITOR') return u.auditorAssignments?.map((a) => a.project) ?? [];
  return orgTeamRef(u)?.projects ?? [];
}
