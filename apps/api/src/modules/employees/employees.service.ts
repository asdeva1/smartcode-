import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ORG_USER_SELECT, orgProjectsRef, orgTeamLeadRef, orgTeamRef, orgVendorRef } from '../../common/org-ref';
import { vendorProjectWhere } from '../../common/vendor-scope';
import { LoginNameAllocationService } from '../login-name-allocations/login-name-allocation.service';
import type { ListEmployeesDto } from './dto/list-employees.dto';

type OrgUserRow = {
  id: string;
  fullName: string | null;
  employeeId: string;
  loginName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  vendor?: { id: string; name: string } | null;
  vendorAssignments?: { vendor: { id: string; name: string } }[];
  team?: { id: string; name: string; teamLead: { id: string; fullName: string | null; loginName: string } | null; projects?: { id: string; name: string }[] } | null;
  leadsTeam?: { id: string; name: string; teamLead: { id: string; fullName: string | null; loginName: string } | null; projects?: { id: string; name: string }[] } | null;
  auditorAssignments?: { project: { id: string; name: string } }[];
};

/**
 * Organization Assignment + Auto-Visibility requirement section 8 - the
 * Manager Employee Directory shows "Assigned Project(s)" per employee.
 * For CODER/TEAM_LEAD/AUDITOR this is `orgProjectsRef` (derived from the
 * same Team/AuditorProjectAssignment relations org-ref.ts already
 * resolves - no new table, no duplicated data). A Vendor account's
 * projects span every Team under that vendor and are not reachable from
 * a single User row, so those are resolved by the caller
 * (`vendorProjectsById`) and passed in; a Manager has enterprise-wide
 * scope, so `null` ("not a per-project assignment") is correct for it,
 * not an empty list.
 */
function toRow(u: OrgUserRow, vendorProjects?: { id: string; name: string }[]) {
  const team = orgTeamRef(u);
  return {
    id: u.id,
    employeeId: u.employeeId,
    fullName: u.fullName,
    loginName: u.loginName,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    vendor: orgVendorRef(u),
    team: team ? { id: team.id, name: team.name } : null,
    teamLead: orgTeamLeadRef(u),
    assignedProjects: u.role === 'VENDOR' ? (vendorProjects ?? null) : u.role === 'MANAGER' ? null : orgProjectsRef(u),
    createdAt: u.createdAt,
  };
}

/**
 * Employee Directory (docs/09-BUSINESS-RULES.md section 11 / Phase 9) -
 * Manager-only, enterprise-wide account directory. Not a CRM/ATS: a
 * searchable, paginated, server-side-filtered view of every account in
 * SmartCode, built on the SAME `User` table and org-placement resolution
 * (`org-ref.ts`) every other Manager list already uses - no parallel
 * "employee" table or duplicated org logic. Presence (online/offline) is
 * intentionally omitted: no UserSession/presence model exists yet (see
 * docs/09-BUSINESS-RULES.md section 12's explicit "do not invent fake
 * values" instruction), so this phase leaves the column out entirely
 * rather than showing a placeholder.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loginNameAllocations: LoginNameAllocationService,
  ) {}

  async list(caller: AuthUser, query: ListEmployeesDto) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can view the Employee Directory');
    }

    const where: Record<string, unknown> = {};
    if (query.role) where.role = query.role;
    if (query.status === 'active') where.isActive = true;
    if (query.status === 'inactive') where.isActive = false;
    if (query.vendorId) {
      where.OR = [{ vendorId: query.vendorId }, { vendorAssignments: { some: { vendorId: query.vendorId, isActive: true } } }];
    }
    if (query.teamId) {
      where.OR = [...((where.OR as unknown[]) ?? []), { teamId: query.teamId }, { leadsTeam: { id: query.teamId } }];
    }
    if (query.teamLeadId) {
      where.OR = [...((where.OR as unknown[]) ?? []), { team: { teamLeadId: query.teamLeadId } }];
    }
    const search = query.search?.trim();
    if (search) {
      where.AND = [
        ...((where.AND as unknown[]) ?? []),
        {
          OR: [
            { employeeId: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } },
            { loginName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ORG_USER_SELECT,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    const vendorProjectsByVendorId = await this.vendorProjectsFor((rows as OrgUserRow[]).filter((r) => r.role === 'VENDOR').map((r) => r.vendor?.id).filter((id): id is string => !!id));

    return {
      data: (rows as OrgUserRow[]).map((r: OrgUserRow) => toRow(r, r.vendor ? vendorProjectsByVendorId.get(r.vendor.id) : undefined)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Manager-only detail view - identity/account/org fields plus this user's complete Login Name history. Never passwordHash/tokens/secrets. */
  async get(caller: AuthUser, id: string) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can view employee details');
    }
    const user = await this.prisma.user.findUnique({ where: { id }, select: ORG_USER_SELECT });
    if (!user) throw new NotFoundException('Employee not found');

    const row = user as OrgUserRow;
    const vendorProjects = row.role === 'VENDOR' && row.vendor ? (await this.vendorProjectsFor([row.vendor.id])).get(row.vendor.id) : undefined;
    const loginNameHistory = await this.loginNameAllocations.historyForUser(caller, id);
    return { ...toRow(row, vendorProjects), loginNameHistory };
  }

  /** Batch-resolves each vendorId's active Projects (across every Team under it) in one query per call - a Vendor account's projects are not reachable from its own User row. */
  private async vendorProjectsFor(vendorIds: string[]): Promise<Map<string, { id: string; name: string }[]>> {
    const result = new Map<string, { id: string; name: string }[]>();
    const uniqueIds = [...new Set(vendorIds)];
    if (uniqueIds.length === 0) return result;
    await Promise.all(
      uniqueIds.map(async (vendorId) => {
        const projects = await this.prisma.project.findMany({
          where: { ...vendorProjectWhere(vendorId), isActive: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        result.set(vendorId, projects);
      }),
    );
    return result;
  }
}
