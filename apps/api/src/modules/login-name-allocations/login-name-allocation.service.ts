import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { PERSON_SELECT, personRef } from '../../common/scope';
import { ORG_USER_SELECT, orgTeamLeadRef, orgTeamRef, orgVendorRef } from '../../common/org-ref';
import type { ListLoginNameAllocationsDto } from './dto/login-name-allocation.dto';

/** Either the real PrismaService or an interactive $transaction client - both expose the same model delegates used here. */
type Db = PrismaService | Prisma.TransactionClient;

const ALLOCATION_INCLUDE = {
  allocatedBy: { select: PERSON_SELECT },
  deallocatedBy: { select: PERSON_SELECT },
  user: { select: ORG_USER_SELECT },
} as const;

type OrgUserRow = {
  id: string;
  fullName: string | null;
  employeeId: string;
  loginName: string;
  role: string;
  isActive: boolean;
  vendor?: { id: string; name: string } | null;
  vendorAssignments?: { vendor: { id: string; name: string } }[];
  team?: { id: string; name: string; teamLead: { id: string; fullName: string | null; loginName: string } | null } | null;
  leadsTeam?: { id: string; name: string; teamLead: { id: string; fullName: string | null; loginName: string } | null } | null;
};

type AllocationRow = {
  id: string;
  loginName: string;
  employeeId: string;
  status: string;
  allocatedAt: Date;
  deallocatedAt: Date | null;
  reason: string | null;
  // Null only for a pre-Phase-9 account created by the one-time
  // INITIAL_BACKFILL script (apps/api/scripts/backfill-login-name-allocations.ts)
  // - there is no real human allocator to record for those.
  allocatedBy: { id: string; fullName: string | null; employeeId: string; loginName: string } | null;
  deallocatedBy: { id: string; fullName: string | null; employeeId: string; loginName: string } | null;
  user: OrgUserRow;
};

type AllocationDto = ReturnType<typeof toDto>;

function toDto(row: AllocationRow) {
  const team = orgTeamRef(row.user);
  return {
    id: row.id,
    loginName: row.loginName,
    employeeId: row.employeeId,
    status: row.status,
    allocatedAt: row.allocatedAt,
    deallocatedAt: row.deallocatedAt,
    reason: row.reason,
    allocatedBy: row.allocatedBy ? personRef(row.allocatedBy) : null,
    deallocatedBy: row.deallocatedBy ? personRef(row.deallocatedBy) : null,
    user: {
      id: row.user.id,
      fullName: row.user.fullName,
      employeeId: row.user.employeeId,
      loginName: row.user.loginName,
      role: row.user.role,
      isActive: row.user.isActive,
      vendor: orgVendorRef(row.user),
      team: team ? { id: team.id, name: team.name } : null,
      teamLead: orgTeamLeadRef(row.user),
    },
  };
}

/**
 * Login Name Allocation history (docs/09-BUSINESS-RULES.md section 10 /
 * Phase 9) - the append-only ledger behind the Manager's "Login Name
 * Details" screen, and the transactional core of every Login Name
 * reassignment (see `reallocate`, called from inside
 * UsersService.changeLoginName's own transaction - never on its own).
 */
@Injectable()
export class LoginNameAllocationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Closes the target user's current ACTIVE allocation (if any) and opens
   * a brand-new one for `newLoginName`, atomically, using whichever `db`
   * handle the caller passes - the caller (UsersService.changeLoginName)
   * owns the transaction boundary, since the User.loginName update and
   * this allocation change must commit or roll back together. Never
   * updates or deletes a historical row.
   */
  async reallocate(
    db: Db,
    params: { targetUserId: string; employeeId: string; newLoginName: string; actor: Pick<AuthUser, 'id' | 'role'>; reason?: string },
  ) {
    const { targetUserId, employeeId, newLoginName, actor, reason } = params;

    // Defense in depth: the DB's own partial unique index (one ACTIVE row
    // per loginName) would reject this insert anyway if it ever got this
    // far, but surfacing a clear, typed conflict here is far better than
    // a raw Postgres unique-violation bubbling out of a $transaction.
    const conflicting = await db.loginNameAllocation.findFirst({
      where: { loginName: newLoginName, status: 'ACTIVE', userId: { not: targetUserId } },
    });
    if (conflicting) {
      throw new ConflictException('This Login Name already has an active allocation');
    }

    const current = await db.loginNameAllocation.findFirst({ where: { userId: targetUserId, status: 'ACTIVE' } });
    if (current) {
      await db.loginNameAllocation.update({
        where: { id: current.id },
        data: { status: 'REALLOCATED', deallocatedAt: new Date(), deallocatedById: actor.id },
      });
    }

    return db.loginNameAllocation.create({
      data: {
        loginName: newLoginName,
        userId: targetUserId,
        employeeId,
        status: 'ACTIVE',
        allocatedById: actor.id,
        reason: reason?.trim() || undefined,
      },
    });
  }

  /**
   * Manager-only search/list - defaults to `status=ACTIVE` (the live
   * directory of who currently holds what Login Name); `status=all` or a
   * specific status opts into REALLOCATED/DEACTIVATED history rows too.
   */
  async list(caller: AuthUser, query: ListLoginNameAllocationsDto) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can view Login Name allocations');
    }

    const where: Record<string, unknown> = {};
    where.status = query.status && query.status !== 'all' ? query.status : 'ACTIVE';

    const userWhere: Record<string, unknown> = {};
    if (query.role) userWhere.role = query.role;
    if (query.vendorId) {
      userWhere.OR = [{ vendorId: query.vendorId }, { vendorAssignments: { some: { vendorId: query.vendorId, isActive: true } } }];
    }
    if (query.teamId) {
      userWhere.OR = [...((userWhere.OR as unknown[]) ?? []), { teamId: query.teamId }, { leadsTeam: { id: query.teamId } }];
    }
    if (query.teamLeadId) {
      userWhere.OR = [...((userWhere.OR as unknown[]) ?? []), { team: { teamLeadId: query.teamLeadId } }];
    }
    if (Object.keys(userWhere).length) where.user = userWhere;

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { loginName: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.loginNameAllocation.findMany({
        where,
        include: ALLOCATION_INCLUDE,
        orderBy: [{ allocatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.loginNameAllocation.count({ where }),
    ]);

    return { data: (rows as AllocationRow[]).map((row: AllocationRow) => toDto(row)), total, page: query.page, pageSize: query.pageSize };
  }

  /** Manager-only: current allocation (if any) + complete history for one exact Login Name string. */
  async getByLoginName(caller: AuthUser, loginName: string) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can view Login Name allocation history');
    }

    const history = await this.prisma.loginNameAllocation.findMany({
      where: { loginName },
      include: ALLOCATION_INCLUDE,
      orderBy: [{ allocatedAt: 'desc' }],
    });
    if (history.length === 0) {
      throw new NotFoundException('No allocation history found for this Login Name');
    }

    const dtos: AllocationDto[] = (history as AllocationRow[]).map((row: AllocationRow) => toDto(row));
    return { loginName, current: dtos.find((d: AllocationDto) => d.status === 'ACTIVE') ?? null, history: dtos };
  }

  /** Manager-only: complete Login Name history for one user (used by Employee Directory's detail view). */
  async historyForUser(caller: AuthUser, userId: string) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can view Login Name allocation history');
    }
    const rows = await this.prisma.loginNameAllocation.findMany({
      where: { userId },
      orderBy: [{ allocatedAt: 'desc' }],
    });
    type MinimalAllocationRow = { id: string; loginName: string; status: string; allocatedAt: Date; deallocatedAt: Date | null };
    return (rows as MinimalAllocationRow[]).map((r: MinimalAllocationRow) => ({
      id: r.id,
      loginName: r.loginName,
      status: r.status,
      allocatedAt: r.allocatedAt,
      deallocatedAt: r.deallocatedAt,
    }));
  }
}
