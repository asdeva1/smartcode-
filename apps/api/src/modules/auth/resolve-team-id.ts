/**
 * A Team Lead's team is recorded on Team.teamLeadId (set by Manager
 * Team Lead management), not on the Team Lead's own User.teamId, which
 * is only populated for team members (Coders). Every team-scoped check
 * downstream reads AuthUser.teamId, so it is resolved here for the
 * session identity. Coders/Managers/Auditors keep User.teamId unchanged.
 */
export function resolveTeamId(user: {
  role: string;
  teamId: string | null;
  leadsTeam?: { id: string } | null;
}): string | null {
  if (user.role === 'TEAM_LEAD') return user.leadsTeam?.id ?? user.teamId ?? null;
  return user.teamId;
}
