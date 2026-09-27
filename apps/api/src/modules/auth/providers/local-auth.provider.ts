import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import type { AuthUser, TokenPair } from '@smartcode/types';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthProvider } from './auth-provider.interface';
import {
  SESSION_USER_INCLUDE,
  assertVendorAccountUsable,
  passwordStamp,
  toSessionUser,
  tokenMatchesPassword,
  type SessionUserRow,
} from '../session-user';

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
  private readonly logger = new Logger(LocalAuthProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateCredentials(loginName: string, password: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { loginName },
      include: SESSION_USER_INCLUDE,
    });
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

    // Checked only after a correct password, so it never reveals which accounts exist.
    assertVendorAccountUsable(user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.toAuthUser(user);
  }

  async issueTokens(user: AuthUser): Promise<TokenPair> {
    // `pwd` ties the token to the current password; see session-user.ts.
    const stamp = await this.prisma.user.findUnique({ where: { id: user.id }, select: { passwordChangedAt: true } });
    const payload = { sub: user.id, role: user.role, pwd: passwordStamp(stamp?.passwordChangedAt) };
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
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: SESSION_USER_INCLUDE });
    if (!user || !user.isActive || !tokenMatchesPassword(payload, user.passwordChangedAt)) {
      throw new UnauthorizedException('User not found or inactive');
    }
    assertVendorAccountUsable(user);
    return this.toAuthUser(user);
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const payload = await this.jwt.verifyAsync(refreshToken, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
    });
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: SESSION_USER_INCLUDE });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    // A refresh token issued before a password change can no longer mint
    // new sessions - this is what "invalidate existing sessions" means here.
    if (!tokenMatchesPassword(payload, user.passwordChangedAt)) {
      throw new UnauthorizedException('Your password was changed - please sign in again');
    }
    assertVendorAccountUsable(user);
    // Deliberately does not consult a revocation list - see
    // revokeRefreshToken() below for why that's a real, documented gap
    // rather than a silent one.
    return this.issueTokens(this.toAuthUser(user));
  }

  /**
   * KNOWN LIMITATION - deliberately deferred, not silently skipped.
   *
   * This does NOT invalidate the refresh token server-side. A refresh
   * token issued before logout remains cryptographically valid (and
   * usable at POST /auth/refresh) until it naturally expires
   * (JWT_REFRESH_EXPIRY, 7 days by default) or the server-signing secret
   * is rotated. What logout DOES do today, for real: the controller
   * (auth.controller.ts) clears the httpOnly cookie client-side, so the
   * browser stops sending the token on this device/browser - that is a
   * genuine, effective mitigation for the common case (shared/lost
   * device), just not a server-side kill switch reachable from, e.g., a
   * different device holding a copy of the same token.
   *
   * The fix is a Redis SETEX on the token's jti (or its signature) with
   * TTL = remaining token lifetime, checked before trusting a refresh.
   * That slots in as an additional check inside THIS provider, behind
   * the same AuthProvider interface - adding it later requires no
   * restructuring of AuthModule, the controller, or any caller of
   * AuthService. Deferred to the phase that wires up Redis/BullMQ for
   * real (see docs/10-IMPLEMENTATION-ROADMAP.md) rather than built now
   * against a Redis connection nothing else in Phase 1 yet depends on.
   */
  async revokeRefreshToken(_refreshToken: string): Promise<void> {
    this.logger.warn(
      'revokeRefreshToken() called but is a no-op in this phase - the refresh ' +
        'token is NOT invalidated server-side, only the client-side cookie is ' +
        'cleared by the caller. See the method doc comment for why and when ' +
        'this closes.',
    );
    return;
  }

  private toAuthUser(user: SessionUserRow): AuthUser {
    return toSessionUser(user);
  }

  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }
}
