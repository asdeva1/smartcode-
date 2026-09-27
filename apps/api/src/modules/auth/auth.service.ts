import { BadRequestException, ForbiddenException, Injectable, Inject, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import type { AuthUser, TokenPair } from '@smartcode/types';
import { writeAuditLog } from '../../common/audit-log';
import { LocalAuthProvider } from './providers/local-auth.provider';
import type { ChangePasswordDto } from './dto/change-password.dto';
import { AUTH_PROVIDER, type AuthProvider } from './providers/auth-provider.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
    private readonly prisma: PrismaService,
  ) {}

  async login(loginName: string, password: string): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const user = await this.authProvider.validateCredentials(loginName, password);
    if (!user) {
      await this.logAuditEvent(null, 'LOGIN_FAILED', { loginName });
      throw new UnauthorizedException('Invalid login name or password');
    }
    const tokens = await this.authProvider.issueTokens(user);
    await this.logAuditEvent(user.id, 'LOGIN', { loginName });
    return { user, tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.authProvider.refreshTokens(refreshToken);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.authProvider.revokeRefreshToken(refreshToken);
    await this.logAuditEvent(userId, 'LOGOUT', {});
  }

  /**
   * Manager changes their OWN password (no other role, and never another
   * user's password - there is no target id at all). Verifies the current
   * password, hashes the new one with the existing argon2 mechanism, and
   * stamps passwordChangedAt so every access/refresh token issued before
   * this moment is rejected. Returns a fresh token pair for the caller's
   * current device. Failures are audit-logged without any secret.
   */
  async changePassword(caller: AuthUser, dto: ChangePasswordDto): Promise<TokenPair> {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can change their password here');
    }
    const user = await this.prisma.user.findUnique({ where: { id: caller.id } });
    if (!user || !user.isActive) throw new NotFoundException('Account not found');

    const currentOk = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!currentOk) {
      await writeAuditLog(this.prisma, caller, 'PASSWORD_CHANGE_FAILED', 'User', caller.id, { after: { reason: 'current password incorrect' } });
      // 400, not 401: the session itself is still valid.
      throw new BadRequestException('Current password is incorrect');
    }
    if (dto.newPassword !== dto.confirmNewPassword) throw new BadRequestException('Passwords do not match');
    if (await argon2.verify(user.passwordHash, dto.newPassword)) {
      throw new BadRequestException('The new password must be different from the current password');
    }

    const passwordHash = await LocalAuthProvider.hashPassword(dto.newPassword);
    const changedAt = new Date();
    await this.prisma.user.update({
      where: { id: caller.id },
      data: { passwordHash, passwordChangedAt: changedAt, failedLoginCount: 0, lockedUntil: null },
    });
    await writeAuditLog(this.prisma, caller, 'PASSWORD_CHANGED', 'User', caller.id, {
      after: { sessionsInvalidatedBefore: changedAt.toISOString() },
    });
    return this.authProvider.issueTokens(caller);
  }

  /**
   * Writes to the compliance AuditLog for the actions listed in
   * docs/07-SECURITY-ARCHITECTURE.md. IP/user-agent are attached by the
   * controller (request-scoped) once that wiring is added in Phase 2's
   * audit-log interceptor; Phase 1 logs the action itself.
   */
  private async logAuditEvent(
    userId: string | null,
    action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED',
    meta: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: userId ?? undefined,
        action,
        entity: 'Auth',
        entityId: userId ?? meta.loginName?.toString() ?? 'unknown',
        after: meta,
      },
    });
  }
}
