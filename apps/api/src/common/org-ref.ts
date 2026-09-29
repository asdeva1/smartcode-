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
  team: { select: { id: true, name: true, teamLead: { select: { id: true, fullName: true, loginName: true } } } },
  leadsTeam: { select: { id: true, name: true, teamLead: { select: { id: true, fullName: true, loginName: true } } } },
  vendorAssignments: { where: { isActive: true }, select: { vendor: { select: { id: true, name: true } } }, take: 1 },
} as const;

type OrgUser = {
  role: string;
  vendor?: { id: string; name: string } | null;
  vendorAssignments?: { vendor: { id: string; name: string } }[];
  team?: { id: string; name: string; teamLead: { id: string; fullName: string | null; loginName: string } | null } | null;
  leadsTeam?: { id: string; name: string; teamLead: { id: string; fullName: string | null; loginName: string } | null } | null;
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
