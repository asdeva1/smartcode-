interface CoderTeam {
  id: string;
  name: string;
  teamLead: { id: string; fullName: string | null; employeeId: string; loginName: string } | null;
  projects?: { id: string; name: string }[];
}

/** Only the fields the Coder screens need - never passwordHash or login-security counters. */
export function toCoderDto(user: {
  id: string;
  employeeId: string;
  loginName: string;
  email: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt?: Date | null;
  vendorId?: string | null;
  team?: CoderTeam | null;
  vendor?: { id: string; name: string } | null;
}) {
  return {
    id: user.id,
    employeeId: user.employeeId,
    loginName: user.loginName,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
    vendorId: user.vendorId ?? null,
    // Section 10 requirement: the Coder profile shows its Vendor by name,
    // not just the raw id.
    vendor: user.vendor ?? null,
    // Section 2/3 requirement: "View assigned Team Lead" / "View assigned
    // Project(s)" - both are derived (never copied) through the Coder's
    // current team, which the Vendor -> Team Lead cascade keeps current.
    team: user.team ? { id: user.team.id, name: user.team.name } : null,
    teamLead: user.team?.teamLead ?? null,
    projects: user.team?.projects ?? [],
  };
}
