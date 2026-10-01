import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isValidIsoDate, resolvePeriod, type AuthUser } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { writeAuditLog } from '../../common/audit-log';
import { PERSON_SELECT, dateRange, isUniqueViolation, personRef } from '../../common/scope';
import { cascadeCodersOffTeam, cascadeCodersToTeam } from '../../common/team-membership';
import {
  assertProjectAuditorsFit,
  projectVendorId,
  vendorAuditWhere,
  vendorChartWhere,
  vendorCoderWhere,
  vendorMemberWhere,
  vendorProductionWhere,
  vendorProjectWhere,
  vendorReworkWhere,
  vendorTeamWhere,
} from '../../common/vendor-scope';
import { UsersService } from '../users/users.service';
import { CreateVendorAccountDto, CreateVendorDto, ListVendorsDto, UpdateVendorDto } from './dto/vendor.dto';

type MemberRole = 'TEAM_LEAD' | 'AUDITOR';

const PERSON_WITH_STATUS = { ...PERSON_SELECT, email: true, isActive: true } as const;
const person = (u: { id: string; fullName: string | null; employeeId: string; loginName: string; email: string; isActive: boolean }) => ({
  ...personRef(u),
  email: u.email,
  isActive: u.isActive,
});

const ROLE_WORD: Record<MemberRole, string> = { TEAM_LEAD: 'Team Lead', AUDITOR: 'Auditor' };
const ASSIGN_EVENT: Record<MemberRole, string> = { TEAM_LEAD: 'VENDOR_TEAM_LEAD_ASSIGNED', AUDITOR: 'VENDOR_AUDITOR_ASSIGNED' };
const REMOVE_EVENT: Record<MemberRole, string> = { TEAM_LEAD: 'VENDOR_TEAM_LEAD_REMOVED', AUDITOR: 'VENDOR_AUDITOR_REMOVED' };

/**
 * Manager Vendor management and the Vendor's own read-only portal.
 * Vendor management is Manager-only (checked at the route and here); a
 * Vendor account can only ever read its OWN vendor (the vendor id comes
 * from the session, never from the request).
 */
@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  private assertManager(caller: AuthUser) {
    if (caller.role !== 'MANAGER') throw new ForbiddenException('Only a Manager can manage vendors');
  }

  private async findVendor(id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  /** Active Team Lead / Auditor counts per vendor in one grouped query. */
  private async memberCounts(vendorIds: string[]) {
    const rows = vendorIds.length
      ? await this.prisma.vendorAssignment.groupBy({
          by: ['vendorId', 'role'],
          where: { vendorId: { in: vendorIds }, isActive: true },
          _count: { _all: true },
        })
      : [];
    const get = (vendorId: string, role: MemberRole) => rows.find((r) => r.vendorId === vendorId && r.role === role)?._count._all ?? 0;
    return { get };
  }

  private toVendorDto(
    v: { id: string; name: string; code: string; contactName: string | null; contactEmail: string | null; isActive: boolean; createdAt: Date; updatedAt: Date; _count?: { accounts: number } },
    counts: { get: (vendorId: string, role: MemberRole) => number },
  ) {
    return {
      id: v.id,
      name: v.name,
      code: v.code,
      contactName: v.contactName,
      contactEmail: v.contactEmail,
      isActive: v.isActive,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      teamLeadCount: counts.get(v.id, 'TEAM_LEAD'),
      auditorCount: counts.get(v.id, 'AUDITOR'),
      accountCount: v._count?.accounts ?? 0,
    };
  }

  // ─── Manager: CRUD ───────────────────────────────────────────

  async list(caller: AuthUser, q: ListVendorsDto) {
    this.assertManager(caller);
    const where: Prisma.VendorWhereInput = {};
    if (q.status === 'active') where.isActive = true;
    if (q.status === 'inactive') where.isActive = false;
    const search = q.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        include: { _count: { select: { accounts: true } } },
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.vendor.count({ where }),
    ]);
    const counts = await this.memberCounts(rows.map((r) => r.id));
    return { data: rows.map((r) => this.toVendorDto(r, counts)), total, page: q.page, pageSize: q.pageSize };
  }

  /** Lightweight list for vendor filter dropdowns on Manager screens. */
  async options(caller: AuthUser) {
    this.assertManager(caller);
    return this.prisma.vendor.findMany({ select: { id: true, name: true, code: true, isActive: true }, orderBy: { name: 'asc' } });
  }

  private async assertUnique(name: string | undefined, code: string | undefined, exceptId?: string) {
    const or: Prisma.VendorWhereInput[] = [];
    if (name) or.push({ name: { equals: name, mode: 'insensitive' } });
    if (code) or.push({ code: { equals: code, mode: 'insensitive' } });
    if (!or.length) return;
    const clash = await this.prisma.vendor.findFirst({ where: { OR: or, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (clash) throw new ConflictException('A vendor with this name or code already exists');
  }

  async create(caller: AuthUser, dto: CreateVendorDto) {
    this.assertManager(caller);
    await this.assertUnique(dto.name, dto.code);
    try {
      const vendor = await this.prisma.vendor.create({
        data: {
          name: dto.name,
          code: dto.code,
          contactName: dto.contactName || null,
          contactEmail: dto.contactEmail || null,
          createdById: caller.id,
        },
        include: { _count: { select: { accounts: true } } },
      });
      await writeAuditLog(this.prisma, caller, 'VENDOR_CREATED', 'Vendor', vendor.id, {
        after: { name: vendor.name, code: vendor.code, contactName: vendor.contactName, contactEmail: vendor.contactEmail },
      });
      return this.toVendorDto(vendor, { get: () => 0 });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('A vendor with this name or code already exists');
      throw e;
    }
  }

  async update(caller: AuthUser, id: string, dto: UpdateVendorDto) {
    this.assertManager(caller);
    const before = await this.findVendor(id);
    await this.assertUnique(dto.name, undefined, id);
    try {
      const vendor = await this.prisma.vendor.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.contactName !== undefined ? { contactName: dto.contactName || null } : {}),
          ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail || null } : {}),
        },
        include: { _count: { select: { accounts: true } } },
      });
      await writeAuditLog(this.prisma, caller, 'VENDOR_UPDATED', 'Vendor', id, {
        before: { name: before.name, contactName: before.contactName, contactEmail: before.contactEmail },
        after: { name: vendor.name, contactName: vendor.contactName, contactEmail: vendor.contactEmail },
      });
      return this.toVendorDto(vendor, await this.memberCounts([id]));
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('A vendor with this name or code already exists');
      throw e;
    }
  }

  /**
   * Deactivating a vendor locks its Vendor accounts out immediately (checked
   * on every request). Assignments and all data are kept, so reactivating
   * restores everything.
   */
  async setActive(caller: AuthUser, id: string, isActive: boolean) {
    this.assertManager(caller);
    const before = await this.findVendor(id);
    if (before.isActive === isActive) throw new ConflictException(`This vendor is already ${isActive ? 'active' : 'inactive'}`);
    const vendor = await this.prisma.vendor.update({ where: { id }, data: { isActive }, include: { _count: { select: { accounts: true } } } });
    await writeAuditLog(this.prisma, caller, isActive ? 'VENDOR_ACTIVATED' : 'VENDOR_DEACTIVATED', 'Vendor', id, {
      before: { isActive: before.isActive },
      after: { isActive },
    });
    return this.toVendorDto(vendor, await this.memberCounts([id]));
  }

  /** Vendor with its Team Leads, Auditors and login accounts. Managers: any vendor; Vendors: only their own (id from session). */
  async detail(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        _count: { select: { accounts: true } },
        accounts: { where: { role: 'VENDOR' }, select: PERSON_WITH_STATUS, orderBy: { createdAt: 'asc' } },
        assignments: {
          where: { isActive: true },
          orderBy: { assignedAt: 'asc' },
          include: {
            user: {
              select: {
                ...PERSON_WITH_STATUS,
                leadsTeam: { select: { id: true, name: true, _count: { select: { members: { where: { role: 'CODER', isActive: true } } } } } },
                _count: { select: { auditorAssignments: { where: { isActive: true } } } },
              },
            },
          },
        },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const counts = await this.memberCounts([id]);
    const member = (a: (typeof vendor.assignments)[number]) => ({
      assignmentId: a.id,
      assignedAt: a.assignedAt,
      user: person(a.user),
      team: a.user.leadsTeam ? { id: a.user.leadsTeam.id, name: a.user.leadsTeam.name } : null,
      coderCount: a.user.leadsTeam?._count.members ?? 0,
      projectCount: a.user._count.auditorAssignments,
    });
    return {
      ...this.toVendorDto(vendor, counts),
      teamLeads: vendor.assignments.filter((a) => a.role === 'TEAM_LEAD').map(member),
      auditors: vendor.assignments.filter((a) => a.role === 'AUDITOR').map(member),
      accounts: vendor.accounts.map(person),
    };
  }

  async get(caller: AuthUser, id: string) {
    this.assertManager(caller);
    return this.detail(id);
  }

  // ─── Manager: assignments ────────────────────────────────────

  /** Active users of a role that are not in any vendor (candidates for assignment). */
  async assignable(caller: AuthUser, vendorId: string, role: MemberRole) {
    this.assertManager(caller);
    await this.findVendor(vendorId);
    const rows = await this.prisma.user.findMany({
      where: { role, isActive: true, vendorAssignments: { none: { isActive: true } } },
      select: { ...PERSON_WITH_STATUS, leadsTeam: { select: { id: true, name: true } } },
      orderBy: [{ fullName: 'asc' }, { loginName: 'asc' }],
      take: 500,
    });
    return rows.map((u) => ({ ...person(u), team: u.leadsTeam ?? null }));
  }

  /**
   * Vendor -> Team Lead / Auditor. Validates the vendor (exists, active),
   * the user (exists, has the role, active), prevents duplicates and
   * cross-vendor moves (one active vendor per user - also a DB partial
   * unique index), and rejects assignments that would put another
   * vendor's Auditor inside this vendor's projects (or vice versa).
   */
  async assign(caller: AuthUser, vendorId: string, role: MemberRole, userId: string) {
    this.assertManager(caller);
    const vendor = await this.findVendor(vendorId);
    if (!vendor.isActive) throw new ConflictException('This vendor is inactive - activate it before assigning people');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...PERSON_WITH_STATUS, role: true, leadsTeam: { select: { id: true, projects: { select: { id: true } } } } },
    });
    if (!user || user.role !== role) throw new NotFoundException(`${ROLE_WORD[role]} not found`);
    if (!user.isActive) throw new ConflictException(`This ${ROLE_WORD[role]} is inactive - activate the account first`);

    const existing = await this.prisma.vendorAssignment.findFirst({
      where: { userId, isActive: true },
      include: { vendor: { select: { id: true, name: true } } },
    });
    if (existing?.vendorId === vendorId) throw new ConflictException(`This ${ROLE_WORD[role]} is already assigned to this vendor`);
    if (existing) {
      throw new ConflictException(
        `This ${ROLE_WORD[role]} is already assigned to vendor "${existing.vendor.name}". Remove that assignment first - a person can belong to only one vendor.`,
      );
    }

    if (role === 'TEAM_LEAD') {
      // The Team Lead's team (and its projects) moves into this vendor.
      await assertProjectAuditorsFit(this.prisma, user.leadsTeam?.projects.map((p) => p.id) ?? [], vendorId, 'Cannot assign this Team Lead');
    } else {
      // Every project the Auditor already audits must be one of this vendor's projects.
      const assigned = await this.prisma.auditorProjectAssignment.findMany({ where: { auditorId: userId, isActive: true }, select: { project: { select: { id: true, name: true } } } });
      const outside: string[] = [];
      for (const a of assigned) if ((await projectVendorId(this.prisma, a.project.id)) !== vendorId) outside.push(a.project.name);
      if (outside.length) {
        throw new ConflictException(
          `Cannot assign this Auditor: they are assigned to project(s) outside this vendor (${outside.join(', ')}). Remove those project assignments first - cross-vendor access is not allowed.`,
        );
      }
    }

    try {
      const row = await this.prisma.vendorAssignment.create({
        data: { vendorId, userId, role, assignedById: caller.id },
      });
      await writeAuditLog(this.prisma, caller, ASSIGN_EVENT[role], 'Vendor', vendorId, {
        after: { assignmentId: row.id, userId, role, employeeId: user.employeeId, loginName: user.loginName },
      });
      return { assignmentId: row.id, assignedAt: row.assignedAt, vendorId, user: person(user) };
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`This ${ROLE_WORD[role]} was just assigned to a vendor by someone else`);
      throw e;
    }
  }

  /** Ends the assignment (kept as history with removedAt/removedBy) and audit-logs it. */
  async unassign(caller: AuthUser, vendorId: string, role: MemberRole, userId: string) {
    this.assertManager(caller);
    await this.findVendor(vendorId);
    const row = await this.prisma.vendorAssignment.findFirst({ where: { vendorId, userId, role, isActive: true } });
    if (!row) throw new NotFoundException(`This ${ROLE_WORD[role]} is not assigned to this vendor`);
    const removedAt = new Date();
    await this.prisma.vendorAssignment.update({ where: { id: row.id }, data: { isActive: false, removedAt, removedById: caller.id } });
    await writeAuditLog(this.prisma, caller, REMOVE_EVENT[role], 'Vendor', vendorId, {
      before: { assignmentId: row.id, userId, role, assignedAt: row.assignedAt.toISOString() },
      after: { removedAt: removedAt.toISOString() },
    });
    return { assignmentId: row.id, removedAt };
  }

  /**
   * Manager assigns (or changes) the vendor's Team Lead -
   * docs/09-BUSINESS-RULES.md "Vendor -> Team Lead -> Coder Hierarchy".
   * Wraps the plain assign()/unassign() primitives (unchanged, still used
   * as-is for Auditors) with the cascade the business rule requires:
   *
   *   1. If the vendor already has a different active Team Lead, that
   *      assignment is replaced (this IS "the Manager changes the
   *      vendor's Team Lead from TL-01 to TL-02" flow - a single call).
   *   2. The newly assigned Team Lead is guaranteed to have a Team of
   *      their own (auto-created if they don't have one yet), since
   *      Coders need somewhere to point their teamId at.
   *   3. Every ACTIVE Coder whose vendorId is this vendor - whether
   *      created from the Vendor Portal or by a previous Team Lead - is
   *      moved (teamId) onto that Team. Idempotent: running it again
   *      with the same Team Lead is a no-op update.
   *
   * No stale relationship is left behind: coders always end up pointing
   * at the vendor's CURRENT Team Lead, never the previous one.
   */
  async assignTeamLead(caller: AuthUser, vendorId: string, userId: string) {
    this.assertManager(caller);
    const previous = await this.prisma.vendorAssignment.findFirst({
      where: { vendorId, role: 'TEAM_LEAD', isActive: true, userId: { not: userId } },
      select: { userId: true },
    });
    if (previous) {
      await this.unassign(caller, vendorId, 'TEAM_LEAD', previous.userId);
    }

    const result = await this.assign(caller, vendorId, 'TEAM_LEAD', userId);

    let teamLead = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, loginName: true, leadsTeam: { select: { id: true } } } });
    let teamId = teamLead?.leadsTeam?.id;
    if (!teamId) {
      const team = await this.prisma.team.create({
        data: { name: `${teamLead?.fullName ?? teamLead?.loginName ?? 'Team Lead'}'s Team`, teamLeadId: userId },
      });
      teamId = team.id;
      await writeAuditLog(this.prisma, caller, 'TEAM_CREATED', 'Team', team.id, {
        after: { name: team.name, teamLeadId: userId, reason: 'auto-created for vendor Team Lead assignment' },
      });
    }

    const affected = await this.prisma.user.findMany({
      where: { role: 'CODER', vendorId, isActive: true },
      select: { id: true, teamId: true },
    });
    const affectedIds = affected.map((c) => c.id);
    // Only Coders actually MOVING onto this Team get a ledger entry -
    // matches assignTeamLead's own "idempotent, no-op for an already
    // correctly-placed Coder" contract, so re-running this with the same
    // Team Lead never manufactures a spurious membership history row.
    const movingIds = affected.filter((c) => c.teamId !== teamId).map((c) => c.id);
    const cascaded = await this.prisma.$transaction(async (tx) => {
      await cascadeCodersToTeam(tx, caller, movingIds, teamId!);
      return tx.user.updateMany({
        where: { id: { in: affectedIds } },
        data: { teamId },
      });
    });

    await writeAuditLog(this.prisma, caller, 'VENDOR_TEAM_LEAD_CODERS_CASCADED', 'Vendor', vendorId, {
      after: { teamLeadId: userId, teamId, codersMoved: cascaded.count },
    });

    return { ...result, teamId, codersMoved: cascaded.count };
  }

  /**
   * Manager removes the vendor's Team Lead with no replacement. Unlike
   * assignTeamLead(), there is nowhere left for this vendor's Coders to
   * point, so they are detached (teamId -> null) rather than left
   * pointing at a Team Lead who no longer represents this vendor - "do
   * not leave stale Team Lead relationships" applies just as much here.
   */
  async removeTeamLead(caller: AuthUser, vendorId: string, userId: string) {
    this.assertManager(caller);
    const result = await this.unassign(caller, vendorId, 'TEAM_LEAD', userId);
    const affected = await this.prisma.user.findMany({
      where: { role: 'CODER', vendorId, isActive: true, teamId: { not: null } },
      select: { id: true },
    });
    const affectedIds = affected.map((c) => c.id);
    const detached = await this.prisma.$transaction(async (tx) => {
      await cascadeCodersOffTeam(tx, caller, affectedIds);
      return tx.user.updateMany({
        where: { id: { in: affectedIds } },
        data: { teamId: null },
      });
    });
    await writeAuditLog(this.prisma, caller, 'VENDOR_TEAM_LEAD_CODERS_DETACHED', 'Vendor', vendorId, {
      after: { removedTeamLeadId: userId, codersDetached: detached.count },
    });
    return { ...result, codersDetached: detached.count };
  }

  /** Vendor login account (role VENDOR) - same hierarchy, uniqueness, hashing and audit path as every other account. */
  async createAccount(caller: AuthUser, vendorId: string, dto: CreateVendorAccountDto) {
    this.assertManager(caller);
    const vendor = await this.findVendor(vendorId);
    if (!vendor.isActive) throw new ConflictException('This vendor is inactive - activate it before adding accounts');
    const { confirmPassword: _confirm, ...userDto } = dto;
    const user = await this.users.createWithRole(caller, 'VENDOR', userDto, { vendorId });
    await writeAuditLog(this.prisma, caller, 'VENDOR_ACCOUNT_CREATED', 'Vendor', vendorId, {
      after: { userId: user.id, employeeId: user.employeeId, loginName: user.loginName },
    });
    return { id: user.id, fullName: user.fullName, employeeId: user.employeeId, loginName: user.loginName, email: user.email, isActive: user.isActive };
  }

  // ─── Structure, activity, dashboard (Manager for any vendor; Vendor for its own) ─

  async structure(vendorId: string) {
    const vendor = await this.findVendor(vendorId);
    const [teams, auditors] = await Promise.all([
      this.prisma.team.findMany({
        where: vendorTeamWhere(vendorId),
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          teamLead: { select: PERSON_WITH_STATUS },
          members: { where: { role: 'CODER' }, select: PERSON_WITH_STATUS, orderBy: [{ fullName: 'asc' }, { loginName: 'asc' }] },
          projects: { select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } },
        },
      }),
      this.prisma.user.findMany({
        where: vendorMemberWhere(vendorId, 'AUDITOR'),
        orderBy: [{ fullName: 'asc' }, { loginName: 'asc' }],
        select: {
          ...PERSON_WITH_STATUS,
          auditorAssignments: {
            where: { isActive: true, project: vendorProjectWhere(vendorId) },
            select: { project: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);
    return {
      vendor: { id: vendor.id, name: vendor.name, code: vendor.code, isActive: vendor.isActive },
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        teamLead: t.teamLead ? person(t.teamLead) : null,
        coders: t.members.map(person),
        projects: t.projects,
      })),
      auditors: auditors.map((a) => ({ ...person(a), projects: a.auditorAssignments.map((x) => x.project) })),
    };
  }

  /**
   * Operational activity: vendor administration events plus everything
   * the vendor's own people (Team Leads, Auditors, Coders, Vendor
   * accounts) did, from the compliance AuditLog. Never another vendor's.
   */
  async activity(vendorId: string, page: number, pageSize: number) {
    await this.findVendor(vendorId);
    const people = await this.prisma.user.findMany({
      where: {
        OR: [
          { vendorId, role: 'VENDOR' },
          vendorMemberWhere(vendorId, 'TEAM_LEAD'),
          vendorMemberWhere(vendorId, 'AUDITOR'),
          vendorCoderWhere(vendorId),
        ],
      },
      select: { id: true },
    });
    const where: Prisma.AuditLogWhereInput = {
      OR: [{ entity: 'Vendor', entityId: vendorId }, ...(people.length ? [{ userId: { in: people.map((p) => p.id) } }] : [])],
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, action: true, entity: true, entityId: true, role: true, timestamp: true, user: { select: PERSON_SELECT } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({ id: r.id, action: r.action, entity: r.entity, entityId: r.entityId, role: r.role, timestamp: r.timestamp, actor: r.user ? personRef(r.user) : null })),
      total,
      page,
      pageSize,
    };
  }

  /** Vendor dashboard - every figure is computed inside the vendor's scope only. */
  async dashboard(vendorId: string, today?: string) {
    const vendor = await this.findVendor(vendorId);
    const day = today && isValidIsoDate(today) ? today : new Date().toISOString().slice(0, 10);
    const month = resolvePeriod('this_month', day);
    const monthRange = dateRange(month.from, month.to)!;
    const todayRange = dateRange(day, day)!;
    const prod = vendorProductionWhere(vendorId);
    const audit = vendorAuditWhere(vendorId);
    const rework = vendorReworkWhere(vendorId);
    const cur = (extra: Prisma.ProductionEntryWhereInput = {}) => ({ AND: [prod, { isCurrent: true }, extra] });
    const audits = (extra: Prisma.AuditEntryWhereInput = {}) => ({ AND: [audit, extra] });
    const m = (key: string, label: string, value: number) => ({ key, label, value });

    const [
      teams,
      teamLeads,
      coders,
      auditors,
      charts,
      completed,
      inProgress,
      reworkStatus,
      awaitingAudit,
      auditsCompleted,
      reviewRequired,
      rejected,
      pendingRework,
      awaitingReaudit,
      monthRows,
      monthAudits,
      todayRows,
    ] = await Promise.all([
      this.prisma.team.count({ where: vendorTeamWhere(vendorId) }),
      this.prisma.user.count({ where: vendorMemberWhere(vendorId, 'TEAM_LEAD') }),
      this.prisma.user.count({ where: { ...vendorCoderWhere(vendorId), isActive: true } }),
      this.prisma.user.count({ where: vendorMemberWhere(vendorId, 'AUDITOR') }),
      this.prisma.chart.count({ where: vendorChartWhere(vendorId) }),
      this.prisma.productionEntry.count({ where: cur({ status: 'COMPLETED' }) }),
      this.prisma.productionEntry.count({ where: cur({ status: { in: ['PENDING', 'IN_PROGRESS'] } }) }),
      this.prisma.productionEntry.count({ where: cur({ status: 'REWORK' }) }),
      this.prisma.productionEntry.count({ where: cur({ status: 'COMPLETED', auditEntries: { none: {} } }) }),
      this.prisma.auditEntry.count({ where: audits({ status: 'COMPLETED' }) }),
      this.prisma.auditEntry.count({ where: audits({ status: 'REVIEW_REQUIRED' }) }),
      this.prisma.auditEntry.count({ where: audits({ status: 'REJECTED' }) }),
      this.prisma.rework.count({ where: { AND: [rework, { status: { in: ['OPEN', 'IN_PROGRESS'] } }] } }),
      this.prisma.rework.count({ where: { AND: [rework, { status: 'RESOLVED' }] } }),
      this.prisma.productionEntry.findMany({ where: cur({ codedDate: monthRange }), select: { pageCount: true } }),
      this.prisma.auditEntry.count({ where: audits({ auditDate: monthRange }) }),
      this.prisma.productionEntry.count({ where: cur({ codedDate: todayRange }) }),
    ]);
    return {
      role: 'VENDOR' as const,
      vendor: { id: vendor.id, name: vendor.name, code: vendor.code, isActive: vendor.isActive },
      period: { key: 'this_month', from: month.from, to: month.to },
      metrics: [
        m('teams', 'Total Teams', teams),
        m('teamLeads', 'Total Team Leads', teamLeads),
        m('coders', 'Active Coders', coders),
        m('auditors', 'Total Auditors', auditors),
        m('charts', 'Charts', charts),
        m('productionCompleted', 'Production Completed', completed),
        m('productionInProgress', 'Pending / In Progress', inProgress),
        m('productionRework', 'In Rework', reworkStatus),
        m('awaitingAudit', 'Awaiting Audit', awaitingAudit),
        m('auditsCompleted', 'Audits Completed', auditsCompleted),
        m('reviewRequired', 'Review Required', reviewRequired),
        m('auditsRejected', 'Rejected (Rework)', rejected),
        m('pendingRework', 'Pending Rework', pendingRework),
        m('awaitingReaudit', 'Awaiting Re-audit', awaitingReaudit),
        m('monthCharts', 'Charts This Month', monthRows.length),
        m('monthPages', 'Pages This Month', monthRows.reduce((a, r) => a + r.pageCount, 0)),
        m('monthAudits', 'Audits This Month', monthAudits),
        m('todayCharts', "Today's Charts", todayRows),
      ],
    };
  }

  /** Manager dashboard: one row per vendor with its structure and live workload. */
  async overview(caller: AuthUser) {
    this.assertManager(caller);
    const vendors = await this.prisma.vendor.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, isActive: true } });
    const counts = await this.memberCounts(vendors.map((v) => v.id));
    return Promise.all(
      vendors.map(async (v) => {
        const [coders, productionCompleted, auditsCompleted, pendingRework] = await Promise.all([
          this.prisma.user.count({ where: { ...vendorCoderWhere(v.id), isActive: true } }),
          this.prisma.productionEntry.count({ where: { AND: [vendorProductionWhere(v.id), { isCurrent: true, status: 'COMPLETED' }] } }),
          this.prisma.auditEntry.count({ where: { AND: [vendorAuditWhere(v.id), { status: 'COMPLETED' }] } }),
          this.prisma.rework.count({ where: { AND: [vendorReworkWhere(v.id), { status: { in: ['OPEN', 'IN_PROGRESS'] } }] } }),
        ]);
        return {
          ...v,
          teamLeads: counts.get(v.id, 'TEAM_LEAD'),
          auditors: counts.get(v.id, 'AUDITOR'),
          coders,
          productionCompleted,
          auditsCompleted,
          pendingRework,
        };
      }),
    );
  }
}
