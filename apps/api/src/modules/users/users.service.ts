import { Injectable, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { canCreateRole, type AuthUser, type Role } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { LocalAuthProvider } from '../auth/providers/local-auth.provider';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateTeamLeadDto } from './dto/create-team-lead.dto';
import { UpdateTeamLeadDto } from './dto/update-team-lead.dto';
import { ListTeamLeadsDto } from './dto/list-team-leads.dto';
import { CreateAuditorDto } from './dto/create-auditor.dto';
import { UpdateAuditorDto } from './dto/update-auditor.dto';
import { ListAuditorsDto } from './dto/list-auditors.dto';
import { CreateCoderDto } from './dto/create-coder.dto';
import { requireTeam } from '../../common/scope';
import { assertProjectAuditorsFit, requireVendor, userVendorId, vendorActiveTeamLeadTeamId } from '../../common/vendor-scope';
import { writeAuditLog } from '../../common/audit-log';
import { generateTempPassword } from '../../common/password';
import { toCoderDto } from './coder.mapper';

/** The user's single active vendor, shown on the Manager's Team Lead / Auditor lists. */
const ACTIVE_VENDOR_INCLUDE = {
  vendorAssignments: { where: { isActive: true }, select: { vendor: { select: { id: true, name: true } } }, take: 1 },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hierarchy-enforced creation — docs/03-RBAC-PERMISSIONS.md
   * "Hierarchy Enforcement (creation rules)". Any disallowed combination
   * (e.g. TL creating a TL) is rejected AND logged as a denied action,
   * since repeated attempts are a useful security signal.
   */
  async createWithRole(
    creator: AuthUser,
    targetRole: Role,
    dto: CreateUserDto,
    extra: { vendorId?: string; teamId?: string } = {},
  ) {
    if (!canCreateRole(creator.role, targetRole)) {
      await this.prisma.auditLog.create({
        data: {
          userId: creator.id,
          role: creator.role,
          action: 'USER_CREATE_DENIED',
          entity: 'User',
          entityId: dto.loginName,
          after: { attemptedRole: targetRole },
        },
      });
      throw new ForbiddenException(
        `Role '${creator.role}' is not permitted to create a '${targetRole}' user`,
      );
    }

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ loginName: dto.loginName }, { employeeId: dto.employeeId }, { email: dto.email }] },
    });
    if (existing) {
      throw new ConflictException('A user with this login name, employee ID, or email already exists');
    }

    const passwordHash = await LocalAuthProvider.hashPassword(dto.password);

    // A Team Lead creating a Coder auto-assigns the Coder to the TL's own
    // team; a Vendor creating a Coder auto-assigns whatever team its
    // currently-assigned Team Lead leads (or none yet - see
    // docs/09-BUSINESS-RULES.md "Vendor -> Team Lead -> Coder Hierarchy").
    // `extra.teamId` (explicitly, even when undefined) always wins over
    // the creator's own teamId so a Vendor caller (whose own teamId is
    // always null) never accidentally inherits one.
    const teamId =
      targetRole === 'CODER' ? (extra.teamId !== undefined ? extra.teamId : creator.teamId ?? undefined) : undefined;

    const user = await this.prisma.user.create({
      data: {
        employeeId: dto.employeeId,
        fullName: dto.fullName,
        loginName: dto.loginName,
        email: dto.email,
        passwordHash,
        role: targetRole,
        createdById: creator.id,
        teamId,
        // Vendor accounts are linked to their own vendor directly; Coder
        // accounts are linked to whichever vendor created/owns them (see
        // the vendorId field's doc comment in schema.prisma). No other
        // role ever carries vendorId.
        ...(extra.vendorId && (targetRole === 'VENDOR' || targetRole === 'CODER') ? { vendorId: extra.vendorId } : {}),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: creator.id,
        role: creator.role,
        action: targetRole === 'TEAM_LEAD' ? 'TEAM_LEAD_CREATED' : 'USER_CREATED',
        entity: 'User',
        entityId: user.id,
        after: { employeeId: user.employeeId, loginName: user.loginName, role: user.role },
      },
    });

    const { passwordHash: _omit, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Team-Lead-specific creation - wraps createWithRole's hierarchy
   * enforcement and uniqueness checks, then additionally handles the
   * optional "assign to an existing Team" step. Kept separate from
   * createWithRole (still used as-is for Auditor creation) rather than
   * overloading it with team-assignment logic that only applies here.
   */
  async createTeamLead(caller: AuthUser, dto: CreateTeamLeadDto) {
    if (dto.teamId) {
      const team = await this.prisma.team.findUnique({ where: { id: dto.teamId }, include: { projects: { select: { id: true } } } });
      if (!team) throw new NotFoundException('Team not found');
      if (team.teamLeadId) {
        throw new ConflictException('This team already has a Team Lead assigned');
      }
      // A brand-new Team Lead has no vendor, so the team's projects must not hold vendor Auditors.
      await assertProjectAuditorsFit(this.prisma, team.projects?.map((p) => p.id) ?? [], null, 'Cannot assign this team');
    }

    // confirmPassword was already checked by CreateTeamLeadDto; it is
    // dropped here so it can never reach persistence.
    const { teamId, confirmPassword: _confirm, ...userDto } = dto;
    const user = await this.createWithRole(caller, 'TEAM_LEAD', userDto);

    if (teamId) {
      await this.prisma.team.update({ where: { id: teamId }, data: { teamLeadId: user.id } });
    }

    return this.toTeamLeadDto(await this.findTeamLeadById(user.id));
  }

  /**
   * A Team Lead creates a Coder on their own team, or a Vendor creates a
   * Coder on their own vendor - docs/09-BUSINESS-RULES.md "Vendor -> Team
   * Lead -> Coder Hierarchy" / "Coder Creation From Vendor Portal".
   * createWithRole enforces the hierarchy (only TEAM_LEAD/VENDOR may
   * create CODER), uniqueness, hashing and audit logging.
   *
   * - Team Lead caller: Coder gets the caller's team (existing behaviour)
   *   and, if the Team Lead is themselves assigned to a vendor, that
   *   vendor - so the Coder is trackable and correctly cascaded if the
   *   Manager later reassigns that vendor's Team Lead.
   * - Vendor caller: Coder gets the caller's vendor (vendorId is derived
   *   from the session, never trusted from the request body) and, if the
   *   vendor already has an active Team Lead assigned, that Team Lead's
   *   team - otherwise no team yet, until one is assigned.
   *
   * confirmPassword is validated by CreateCoderDto and never persisted.
   */
  async createCoder(caller: AuthUser, dto: CreateCoderDto) {
    let vendorId: string | undefined;
    let teamId: string | undefined;
    if (caller.role === 'TEAM_LEAD') {
      requireTeam(caller);
      vendorId = (await userVendorId(this.prisma, caller.id)) ?? undefined;
    } else if (caller.role === 'VENDOR') {
      vendorId = requireVendor(caller);
      teamId = await vendorActiveTeamLeadTeamId(this.prisma, vendorId);
    } else {
      throw new ForbiddenException('Only a Team Lead or a Vendor can create a Coder');
    }

    const { confirmPassword: _confirm, isActive, ...userDto } = dto;
    let user = await this.createWithRole(caller, 'CODER', userDto, { vendorId, teamId });
    if (isActive === false) {
      const updated = await this.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      await writeAuditLog(this.prisma, caller, 'USER_DEACTIVATED', 'User', user.id, {
        before: { isActive: true },
        after: { isActive: false, reason: 'created inactive' },
      });
      const { passwordHash: _omit, ...safe } = updated;
      user = safe;
    }
    return toCoderDto(user);
  }

  /** Scoped list — Manager sees all, TL sees own team, others see self only. */
  async findScoped(caller: AuthUser) {
    const where =
      caller.role === 'MANAGER'
        ? {}
        : caller.role === 'TEAM_LEAD'
          ? { teamId: caller.teamId ?? '__none__' }
          : { id: caller.id };

    const users = await this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' } });
    return users.map(({ passwordHash: _omit, ...u }: any) => u);
  }

  async setActive(caller: AuthUser, targetId: string, isActive: boolean) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');

    const allowed =
      (caller.role === 'MANAGER' && (target.role === 'TEAM_LEAD' || target.role === 'AUDITOR' || target.role === 'VENDOR')) ||
      // caller.teamId must be non-null: a Team Lead without a team must
      // never match an unassigned Coder through null === null.
      (caller.role === 'TEAM_LEAD' &&
        target.role === 'CODER' &&
        caller.teamId !== null &&
        target.teamId === caller.teamId) ||
      // Same null-guard for a Vendor without an active vendor.
      (caller.role === 'VENDOR' &&
        target.role === 'CODER' &&
        caller.vendorId !== null &&
        target.vendorId === caller.vendorId);

    if (!allowed) {
      throw new ForbiddenException('You are not permitted to change this user\'s status');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { isActive },
    });

    const actionBase = target.role === 'TEAM_LEAD' ? 'TEAM_LEAD' : 'USER';
    await this.prisma.auditLog.create({
      data: {
        userId: caller.id,
        role: caller.role,
        action: isActive ? `${actionBase}_ACTIVATED` : `${actionBase}_DEACTIVATED`,
        entity: 'User',
        entityId: targetId,
        before: { isActive: target.isActive },
        after: { isActive },
      },
    });

    const { passwordHash: _omit, ...safeUser } = updated;
    return safeUser;
  }

  /**
   * Direct password reset (docs/09-BUSINESS-RULES.md sections 6/7/11) -
   * MANAGER ONLY as of Phase 8. A Vendor/Team Lead can no longer reset a
   * Coder's password directly; they REQUEST one instead, and only a
   * Manager's approval generates a single-use reset link (see
   * PasswordResetService in modules/password-reset). Manager keeps this
   * direct path for every role it may reset (Team Lead / Coder / Auditor /
   * Vendor, never another Manager) - e.g. a Manager resetting a Vendor
   * account's own login, which has no "request" step at all.
   * Generates a one-time random password (never a client-supplied value -
   * this is a reset, not a "set password" form), hashes it with the same
   * Argon2 path every account uses, and stamps passwordChangedAt so every
   * session/refresh token issued before this moment stops working (the
   * same invalidation mechanism AuthService.changePassword uses for a
   * Manager's own password). The plaintext is returned to the caller
   * exactly once, in this response, to hand to the account's owner out of
   * band - it is never written to the AuditLog or any other log.
   */
  async resetPassword(caller: AuthUser, targetId: string): Promise<{ id: string; loginName: string; temporaryPassword: string }> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');

    const allowed = caller.role === 'MANAGER' && target.role !== 'MANAGER';

    if (!allowed) {
      throw new ForbiddenException("You are not permitted to reset this user's password");
    }

    const temporaryPassword = generateTempPassword();
    const passwordHash = await LocalAuthProvider.hashPassword(temporaryPassword);
    const changedAt = new Date();
    await this.prisma.user.update({
      where: { id: targetId },
      data: { passwordHash, passwordChangedAt: changedAt, failedLoginCount: 0, lockedUntil: null },
    });
    // Never include the password (or its hash) in the audit log - only that a reset happened.
    await writeAuditLog(this.prisma, caller, 'PASSWORD_RESET', 'User', targetId, {
      after: { targetRole: target.role, sessionsInvalidatedBefore: changedAt.toISOString() },
    });

    return { id: targetId, loginName: target.loginName, temporaryPassword };
  }

  /**
   * Login Name change (docs/09-BUSINESS-RULES.md section 8/9). Manager
   * changes it directly; a Team Lead may only REQUEST a change for their
   * own-team Coder (see ApprovalsService for the request/approve path).
   * Preserves the User row (id, history, ProductionEntry/AuditEntry
   * ownership) - only the loginName column changes.
   */
  async changeLoginName(caller: AuthUser, targetId: string, newLoginName: string) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can change a Login Name directly');
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'MANAGER' && target.id !== caller.id) {
      throw new ForbiddenException('Cannot change another Manager\'s Login Name');
    }
    const loginName = newLoginName.trim();
    if (loginName === target.loginName) return { id: targetId, loginName };

    const conflict = await this.prisma.user.findFirst({ where: { loginName, id: { not: targetId } } });
    if (conflict) throw new ConflictException('This Login Name is already taken');

    const updated = await this.prisma.user.update({ where: { id: targetId }, data: { loginName } });
    await writeAuditLog(this.prisma, caller, 'LOGIN_NAME_CHANGED', 'User', targetId, {
      before: { loginName: target.loginName },
      after: { loginName: updated.loginName },
    });
    return { id: targetId, loginName: updated.loginName };
  }

  /**
   * Manager-only, paginated, searchable Team Lead list - distinct from
   * findScoped() above, which returns ALL visible users unpaginated for
   * whichever role calls it. This is the dedicated listing this
   * module's UI actually needs.
   */
  async findTeamLeads(caller: AuthUser, query: ListTeamLeadsDto) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can list Team Leads');
    }

    const where: Record<string, unknown> = { role: 'TEAM_LEAD' as const };
    if (query.status === 'active') where.isActive = true;
    if (query.status === 'inactive') where.isActive = false;
    if (query.teamId) where.teamId = query.teamId;
    if (query.vendorId) where.vendorAssignments = { some: { vendorId: query.vendorId, isActive: true } };
    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { loginName: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { team: { select: { id: true, name: true } }, ...ACTIVE_VENDOR_INCLUDE },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: rows.map((r: any) => this.toTeamLeadDto(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async updateTeamLead(caller: AuthUser, id: string, dto: UpdateTeamLeadDto) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can edit a Team Lead');
    }

    const target = await this.findTeamLeadById(id);

    if (dto.employeeId || dto.email) {
      const conflict = await this.prisma.user.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(dto.employeeId ? [{ employeeId: dto.employeeId }] : []),
            ...(dto.email ? [{ email: dto.email }] : []),
          ],
        },
      });
      if (conflict) {
        throw new ConflictException('Another user already has this employee ID or email');
      }
    }

    if (dto.teamId !== undefined) {
      // Clear this Team Lead from whichever team they currently lead
      // (if any) before assigning the new one, and reject assigning
      // them to a team that already has a different Team Lead.
      if (dto.teamId === null) {
        await this.prisma.team.updateMany({ where: { teamLeadId: id }, data: { teamLeadId: null } });
      } else {
        const team = await this.prisma.team.findUnique({ where: { id: dto.teamId }, include: { projects: { select: { id: true } } } });
        if (!team) throw new NotFoundException('Team not found');
        if (team.teamLeadId && team.teamLeadId !== id) {
          throw new ConflictException('This team already has a Team Lead assigned');
        }
        // The team moves into this Team Lead's vendor (or out of any vendor).
        const projectIds = team.projects?.map((p) => p.id) ?? [];
        if (projectIds.length) {
          await assertProjectAuditorsFit(this.prisma, projectIds, await userVendorId(this.prisma, id), 'Cannot assign this team');
        }
        await this.prisma.team.updateMany({ where: { teamLeadId: id }, data: { teamLeadId: null } });
        await this.prisma.team.update({ where: { id: dto.teamId }, data: { teamLeadId: id } });
      }
    }

    const { teamId: _teamId, ...fields } = dto;
    const updated = await this.prisma.user.update({
      where: { id },
      data: fields,
      include: { team: { select: { id: true, name: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: caller.id,
        role: caller.role,
        action: 'TEAM_LEAD_UPDATED',
        entity: 'User',
        entityId: id,
        before: {
          fullName: target.fullName,
          email: target.email,
          employeeId: target.employeeId,
          teamId: target.teamId,
        },
        after: { fullName: updated.fullName, email: updated.email, employeeId: updated.employeeId },
      },
    });

    return this.toTeamLeadDto(updated);
  }

  private async findTeamLeadById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { team: { select: { id: true, name: true } } },
    });
    if (!user || user.role !== 'TEAM_LEAD') {
      throw new NotFoundException('Team Lead not found');
    }
    return user;
  }

  /** Strips passwordHash and every other sensitive/internal field - never returned to the client. */
  private toTeamLeadDto(user: any) {
    return {
      id: user.id,
      employeeId: user.employeeId,
      loginName: user.loginName,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      team: user.team ?? null,
      vendor: user.vendorAssignments?.[0]?.vendor ?? null,
    };
  }

  /**
   * Auditor creation - createWithRole already enforces the hierarchy
   * (only MANAGER may create AUDITOR), uniqueness of login name /
   * employee ID / email, password hashing and audit logging. This only
   * drops confirmPassword (already checked by CreateAuditorDto) and
   * shapes the response.
   */
  async createAuditor(caller: AuthUser, dto: CreateAuditorDto) {
    const { confirmPassword: _confirm, ...userDto } = dto;
    const user = await this.createWithRole(caller, 'AUDITOR', userDto);
    return this.toAuditorDto(user);
  }

  /** Manager-only, paginated, searchable list restricted to role AUDITOR. */
  async findAuditors(caller: AuthUser, query: ListAuditorsDto) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can list Auditors');
    }

    const where: Record<string, unknown> = { role: 'AUDITOR' as const };
    if (query.vendorId) where.vendorAssignments = { some: { vendorId: query.vendorId, isActive: true } };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { loginName: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: ACTIVE_VENDOR_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: rows.map((r: any) => this.toAuditorDto(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async updateAuditor(caller: AuthUser, id: string, dto: UpdateAuditorDto) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can edit an Auditor');
    }

    const target = await this.findAuditorById(id);

    if (dto.employeeId || dto.email) {
      const conflict = await this.prisma.user.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(dto.employeeId ? [{ employeeId: dto.employeeId }] : []),
            ...(dto.email ? [{ email: dto.email }] : []),
          ],
        },
      });
      if (conflict) {
        throw new ConflictException('Another user already has this employee ID or email');
      }
    }

    // Explicit field list - loginName and role can never be changed here.
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: caller.id,
        role: caller.role,
        action: 'USER_UPDATED',
        entity: 'User',
        entityId: id,
        before: { fullName: target.fullName, email: target.email, employeeId: target.employeeId },
        after: { fullName: updated.fullName, email: updated.email, employeeId: updated.employeeId },
      },
    });

    return this.toAuditorDto(updated);
  }

  private async findAuditorById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'AUDITOR') {
      throw new NotFoundException('Auditor not found');
    }
    return user;
  }

  /** Only the fields the Auditor table needs - never passwordHash or login-security fields. */
  private toAuditorDto(user: any) {
    return {
      id: user.id,
      employeeId: user.employeeId,
      loginName: user.loginName,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      vendor: user.vendorAssignments?.[0]?.vendor ?? null,
    };
  }
}
