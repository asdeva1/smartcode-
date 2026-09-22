import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import type { AuthUser, TokenPair } from '@smartcode/types';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthProvider } from './auth-provider.interface';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * v1 implementation of AuthProvider — see docs/07-SECURITY-ARCHITECTURE.md.
 * Passwords hashed with argon2id. Access tokens are short-lived; refresh
 * tokens are longer-lived and intended to be carried in an httpOnly cookie
 * by the caller (apps/web sets this, not this service).
 */
@Injectable()
export class LocalAuthProvider implements AuthProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateCredentials(loginName: string, password: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { loginName } });
    if (!user || !user.isActive) return null;

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked due to failed login attempts');
    }

    const valid = await argon2.verify(user.passwordHash, password);

    if (!valid) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockedUntil =
        failedLoginCount >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
          : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount, lockedUntil },
      });
      return null;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.toAuthUser(user);
  }

  async issueTokens(user: AuthUser): Promise<TokenPair> {
    const payload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRY'),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRY'),
    });
    return { accessToken, refreshToken };
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    const payload = await this.jwt.verifyAsync(token, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
    });
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return this.toAuthUser(user);
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const payload = await this.jwt.verifyAsync(refreshToken, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
    });
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    // NOTE: Phase 1 does not yet implement a refresh-token blocklist in
    // Redis for revocation-on-logout — flagged in the Phase 1 report as
    // a known gap to close alongside the Redis/BullMQ wiring.
    return this.issueTokens(this.toAuthUser(user));
  }

  async revokeRefreshToken(_refreshToken: string): Promise<void> {
    // See NOTE above — Redis-backed blocklist lands with the caching work.
    return;
  }

  private toAuthUser(user: {
    id: string;
    employeeId: string;
    loginName: string;
    email: string;
    role: string;
    teamId: string | null;
    isActive: boolean;
  }): AuthUser {
    return {
      id: user.id,
      employeeId: user.employeeId,
      loginName: user.loginName,
      email: user.email,
      role: user.role as AuthUser['role'],
      teamId: user.teamId,
      isActive: user.isActive,
    };
  }

  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }
}
