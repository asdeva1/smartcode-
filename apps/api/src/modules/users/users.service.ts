import { Injectable, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { canCreateRole, type AuthUser, type Role } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { LocalAuthProvider } from '../auth/providers/local-auth.provider';
import { CreateUserDto } from './dto/create-user.dto';

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
    // team - see docs/03-RBAC-PERMISSIONS.md.
    const teamId = targetRole === 'CODER' ? creator.teamId ?? undefined : undefined;

    const user = await this.prisma.user.create({
      data: {
        employeeId: dto.employeeId,
        loginName: dto.loginName,
        email: dto.email,
        passwordHash,
        role: targetRole,
        createdById: creator.id,
        teamId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: creator.id,
        role: creator.role,
        action: 'USER_CREATED',
        entity: 'User',
        entityId: user.id,
        after: { employeeId: user.employeeId, loginName: user.loginName, role: user.role },
      },
    });

    const { passwordHash: _omit, ...safeUser } = user;
    return safeUser;
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
      (caller.role === 'MANAGER' && (target.role === 'TEAM_LEAD' || target.role === 'AUDITOR')) ||
      (caller.role === 'TEAM_LEAD' && target.role === 'CODER' && target.teamId === caller.teamId);

    if (!allowed) {
      throw new ForbiddenException('You are not permitted to change this user\'s status');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { isActive },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: caller.id,
        role: caller.role,
        action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        entity: 'User',
        entityId: targetId,
        before: { isActive: target.isActive },
        after: { isActive },
      },
    });

    const { passwordHash: _omit, ...safeUser } = updated;
    return safeUser;
  }
}
