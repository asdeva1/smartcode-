import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser, TokenPair } from '@smartcode/types';
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
