import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { requireVendor, vendorCoderWhere, vendorMemberWhere, vendorProjectWhere, vendorTeamWhere, auditorProjectWhere } from '../../common/vendor-scope';
import { ORG_USER_SELECT, orgTeamLeadRef, orgTeamRef, orgVendorRef } from '../../common/org-ref';

/**
 * "Organization Assignment + Auto-Visibility" requirement - single,
 * role-aware "what is my current authorized organizational context"
 * endpoint (requirement sections 2/9/12): the backend is the source of
 * truth for a user's Vendor/Team/Team Lead/Project(s), and every
 * dashboard/workspace consumes THIS instead of asking the user to
 * re-select something they are already assigned to.
 *
 * Deliberately reuses the exact same primitives every other screen in
 * this codebase already uses for "where does this account sit" - org-ref
 * .ts's `orgVendorRef`/`orgTeamRef`/`orgTeamLeadRef` (Employee Directory,
 * Login Name Allocation) and vendor-scope.ts's `auditorProjectWhere`/
 * `vendorProjectWhere` (Projects "mine" list) - rather than inventing a
 * parallel resolution path or duplicating assignment data into a new
 * table (requirement section 9's explicit "do not duplicate assignment
 * information unnecessarily").
 */
@Injectable()
export class OrgContextService {
  constructor(private readonly prisma: PrismaService) {}

  async me(caller: AuthUser) {
    if (caller.role === 'MANAGER') {
      return { role: 'MANAGER' as const, scope: 'ENTERPRISE' as const };
    }

    if (caller.role === 'VENDOR') {
      const vendorId = requireVendor(caller);
      const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true, code: true, isActive: true } });
      const [teams, teamLeads, coders, auditors, projects, activeUsers] = await Promise.all([
        this.prisma.team.findMany({ where: vendorTeamWhere(vendorId), select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        this.prisma.user.findMany({ where: vendorMemberWhere(vendorId, 'TEAM_LEAD'), select: { id: true, fullName: true, loginName: true }, orderBy: { fullName: 'asc' } }),
        this.prisma.user.count({ where: { ...vendorCoderWhere(vendorId), isActive: true } }),
        this.prisma.user.findMany({ where: vendorMemberWhere(vendorId, 'AUDITOR'), select: { id: true, fullName: true, loginName: true }, orderBy: { fullName: 'asc' } }),
        this.prisma.project.findMany({ where: { ...vendorProjectWhere(vendorId), isActive: true }, select: { id: true, name: true, client: { select: { id: true, name: true } } }, orderBy: { name: 'asc' } }),
        this.prisma.user.count({ where: { OR: [{ vendorId, isActive: true }, { vendorAssignments: { some: { vendorId, isActive: true } }, isActive: true }] } }),
      ]);
      return {
        role: 'VENDOR' as const,
        vendor,
        teams,
        teamLeads,
        auditors,
        coderCount: coders,
        projects,
        activeUsers,
      };
    }

    // CODER / TEAM_LEAD / AUDITOR - resolved through the same
    // Vendor/Team/Team-Lead primitives Employee Directory already uses.
    const user = await this.prisma.user.findUnique({ where: { id: caller.id }, select: ORG_USER_SELECT });
    const vendor = user ? orgVendorRef(user as any) : null;
    const team = user ? orgTeamRef(user as any) : null;
    const teamLead = user ? orgTeamLeadRef(user as any) : null;

    const projectWhere =
      caller.role === 'AUDITOR' ? auditorProjectWhere(caller) : caller.role === 'TEAM_LEAD' ? { teamId: caller.teamId ?? '__none__' } : { teamId: caller.teamId ?? '__none__' };
    const projects = await this.prisma.project.findMany({
      where: { ...projectWhere, isActive: true },
      select: { id: true, name: true, allocationType: true, client: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    if (caller.role === 'TEAM_LEAD') {
      const coderCount = team ? await this.prisma.user.count({ where: { role: 'CODER', teamId: team.id, isActive: true } }) : 0;
      const members = team
        ? await this.prisma.user.findMany({ where: { role: 'CODER', teamId: team.id, isActive: true }, select: { id: true, fullName: true, loginName: true, employeeId: true }, orderBy: { fullName: 'asc' } })
        : [];
      return {
        role: 'TEAM_LEAD' as const,
        vendor,
        teams: team ? [team] : [],
        projects,
        coderCount,
        teamMembers: members,
      };
    }

    if (caller.role === 'AUDITOR') {
      return {
        role: 'AUDITOR' as const,
        vendor,
        projects,
        clients: dedupeClients(projects),
      };
    }

    // CODER
    return {
      role: 'CODER' as const,
      vendor,
      team,
      teamLead,
      projects,
    };
  }
}

function dedupeClients(projects: { client: { id: string; name: string } | null }[]) {
  const seen = new Map<string, { id: string; name: string }>();
  for (const p of projects) if (p.client) seen.set(p.client.id, p.client);
  return [...seen.values()];
}
