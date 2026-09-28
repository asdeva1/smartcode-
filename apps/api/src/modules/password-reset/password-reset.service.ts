import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { PERSON_SELECT, personRef, requireTeam } from '../../common/scope';
import { requireVendor, vendorCoderWhere } from '../../common/vendor-scope';
import { writeAuditLog } from '../../common/audit-log';
import { LocalAuthProvider } from '../auth/providers/local-auth.provider';
import { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MINUTES } from '../../common/reset-token';
import type { RequestPasswordResetDto, ListPasswordResetRequestsDto } from './dto/password-reset.dto';

const TARGET_SELECT = {
  ...PERSON_SELECT,
  email: true,
  role: true,
  vendorId: true,
  vendor: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
} as const;

const REQUEST_INCLUDE = {
  targetUser: { select: TARGET_SELECT },
  requestedBy: { select: PERSON_SELECT },
  reviewedBy: { select: PERSON_SELECT },
  tokens: { orderBy: { createdAt: 'desc' as const }, take: 1 },
};

type TargetRow = { id: string; fullName: string | null; employeeId: string; loginName: string; email: string; role: string; vendorId: string | null; vendor: { id: string; name: string } | null; team: { id: string; name: string } | null };

function targetRef(u: TargetRow) {
  return { ...personRef(u), email: u.email, role: u.role, vendor: u.vendor, team: u.team };
}

function tokenStatus(token: { expiresAt: Date; usedAt: Date | null; invalidatedAt: Date | null } | undefined) {
  if (!token) return null;
  if (token.usedAt) return 'USED';
  if (token.invalidatedAt) return 'INVALIDATED';
  if (token.expiresAt < new Date()) return 'EXPIRED';
  return 'ACTIVE';
}

function toDto(row: {
  id: string;
  status: string;
  reason: string | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  targetUser: TargetRow;
  requestedBy: { id: string; fullName: string | null; employeeId: string; loginName: string };
  reviewedBy: { id: string; fullName: string | null; employeeId: string; loginName: string } | null;
  tokens: { expiresAt: Date; usedAt: Date | null; invalidatedAt: Date | null }[];
}) {
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    targetUser: targetRef(row.targetUser),
    requestedBy: personRef(row.requestedBy),
    requestedAt: row.requestedAt,
    reviewedBy: row.reviewedBy ? personRef(row.reviewedBy) : null,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason,
    resetLink: { status: tokenStatus(row.tokens[0]), expiresAt: row.tokens[0]?.expiresAt ?? null },
  };
}

/**
 * Password Reset Request workflow (docs/09-BUSINESS-RULES.md section 8 /
 * Phase 8): Vendor/Team Lead REQUEST a reset for one of their own-scope
 * Coders; only a Manager can Approve (generating a single-use,
 * time-limited reset link) or Reject (no link is ever generated). Manager
 * keeps the existing DIRECT reset (UsersService.resetPassword) for every
 * account it is already authorized to reset - this module does not touch
 * that path, it only replaces what a Vendor/Team Lead could do.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Vendor: own-vendor Coder only. Team Lead: own-team Coder only. Never Manager, never another scope's Coder. */
  async request(caller: AuthUser, targetId: string, dto: RequestPasswordResetDto) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');

    let allowed = false;
    if (caller.role === 'TEAM_LEAD') {
      const teamId = requireTeam(caller);
      allowed = target.role === 'CODER' && target.teamId === teamId;
    } else if (caller.role === 'VENDOR') {
      const vendorId = requireVendor(caller);
      const match = await this.prisma.user.findFirst({ where: { id: targetId, ...vendorCoderWhere(vendorId) } });
      allowed = !!match;
    }
    if (!allowed) {
      throw new ForbiddenException('You are not permitted to request a password reset for this user');
    }

    const pending = await this.prisma.passwordResetRequest.findFirst({
      where: { targetUserId: targetId, status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictException('A password reset request for this user is already pending Manager review');
    }

    const created = await this.prisma.passwordResetRequest.create({
      data: {
        targetUserId: targetId,
        requestedById: caller.id,
        reason: dto.reason?.trim() || null,
      },
      include: REQUEST_INCLUDE,
    });

    await writeAuditLog(this.prisma, caller, 'PASSWORD_RESET_REQUESTED', 'PasswordResetRequest', created.id, {
      after: { targetUserId: targetId, targetRole: target.role },
    });

    return toDto(created);
  }

  /** Manager-only queue - defaults to pending, any status via `status`. */
  async list(caller: AuthUser, query: ListPasswordResetRequestsDto) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can view password reset requests');
    }
    const where: Record<string, unknown> = {};
    where.status = query.status && query.status !== 'all' ? query.status : 'PENDING';

    const [rows, total] = await Promise.all([
      this.prisma.passwordResetRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: [{ requestedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.passwordResetRequest.count({ where }),
    ]);

    return { data: rows.map(toDto), total, page: query.page, pageSize: query.pageSize };
  }

  private async loadPending(caller: AuthUser, id: string) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can approve or reject password reset requests');
    }
    const request = await this.prisma.passwordResetRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Password reset request not found');
    if (request.status !== 'PENDING') {
      throw new ConflictException(`This request has already been ${request.status.toLowerCase()}`);
    }
    return request;
  }

  /**
   * Approve: invalidates any still-live token for this user (there should
   * never be one, since only one request can be PENDING per user at a
   * time, but a defensive single-use guarantee is cheap here), generates a
   * new cryptographically random token, stores only its hash, and returns
   * the one-time reset URL built from the raw token - returned ONLY in
   * this response, never persisted, logged, or retrievable again.
   */
  async approve(caller: AuthUser, id: string) {
    const request = await this.loadPending(caller, id);

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: request.targetUserId, usedAt: null, invalidatedAt: null },
      data: { invalidatedAt: new Date() },
    });

    const { raw, hash } = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);
    const token = await this.prisma.passwordResetToken.create({
      data: { requestId: id, userId: request.targetUserId, tokenHash: hash, expiresAt },
    });

    const updated = await this.prisma.passwordResetRequest.update({
      where: { id },
      data: { status: 'APPROVED', reviewedById: caller.id, reviewedAt: new Date() },
      include: REQUEST_INCLUDE,
    });

    await writeAuditLog(this.prisma, caller, 'PASSWORD_RESET_REQUEST_APPROVED', 'PasswordResetRequest', id, {
      after: { targetUserId: request.targetUserId },
    });
    // Separate event for the token itself, per docs/09-BUSINESS-RULES.md
    // section 8's audit list - never includes the raw token or its hash.
    await writeAuditLog(this.prisma, caller, 'PASSWORD_RESET_TOKEN_GENERATED', 'PasswordResetToken', token.id, {
      after: { targetUserId: request.targetUserId, expiresAt: expiresAt.toISOString() },
    });

    const webOrigin = this.config.get<string>('WEB_ORIGIN');
    const resetUrl = `${webOrigin}/reset-password?token=${raw}`;

    return { request: toDto(updated), resetUrl };
  }

  /** Reject: closed out, no token is ever generated. */
  async reject(caller: AuthUser, id: string, reason: string) {
    const request = await this.loadPending(caller, id);

    const updated = await this.prisma.passwordResetRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: caller.id, reviewedAt: new Date(), rejectionReason: reason },
      include: REQUEST_INCLUDE,
    });

    await writeAuditLog(this.prisma, caller, 'PASSWORD_RESET_REQUEST_REJECTED', 'PasswordResetRequest', id, {
      after: { targetUserId: request.targetUserId, reason },
    });

    return toDto(updated);
  }

  /**
   * Public: tells the reset page whether the token can be used, without
   * revealing anything about whose account it belongs to beyond that.
   */
  async validate(rawToken: string): Promise<{ valid: boolean; reason?: 'invalid' | 'expired' | 'used' | 'revoked' }> {
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(rawToken) },
      include: { request: { select: { status: true } } },
    });
    if (!token || token.request.status !== 'APPROVED') return { valid: false, reason: 'invalid' };
    if (token.usedAt) return { valid: false, reason: 'used' };
    if (token.invalidatedAt) return { valid: false, reason: 'revoked' };
    if (token.expiresAt < new Date()) return { valid: false, reason: 'expired' };
    return { valid: true };
  }

  /**
   * Public: completes the reset. Verifies the token end-to-end, hashes the
   * new password with the same Argon2 path every account uses, stamps
   * passwordChangedAt (the existing mechanism that invalidates every
   * access/refresh token issued before this moment - see
   * LocalAuthProvider/JwtStrategy), clears lockout state, marks the token
   * used (and any sibling token invalidated), and marks the request
   * COMPLETED. Never logs the password or the raw/hashed token.
   */
  async complete(rawToken: string, newPassword: string): Promise<{ loginName: string }> {
    const tokenHash = hashResetToken(rawToken);
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { request: true, user: { select: { id: true, loginName: true, role: true } } },
    });

    if (!token || token.request.status !== 'APPROVED') {
      await this.logFailure(token?.userId ?? null, token?.id ?? null, 'invalid');
      throw new NotFoundException('This reset link is invalid');
    }
    if (token.usedAt) {
      await this.logFailure(token.userId, token.id, 'used');
      throw new ConflictException('This reset link has already been used');
    }
    if (token.invalidatedAt) {
      await this.logFailure(token.userId, token.id, 'revoked');
      throw new ConflictException('This reset link is no longer valid');
    }
    if (token.expiresAt < new Date()) {
      await this.logFailure(token.userId, token.id, 'expired');
      throw new ConflictException('This reset link has expired');
    }

    const passwordHash = await LocalAuthProvider.hashPassword(newPassword);
    const changedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash, passwordChangedAt: changedAt, failedLoginCount: 0, lockedUntil: null },
      }),
      this.prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: changedAt } }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: token.userId, id: { not: token.id }, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: changedAt },
      }),
      this.prisma.passwordResetRequest.update({ where: { id: token.requestId }, data: { status: 'COMPLETED' } }),
    ]);

    // System-initiated (the acting "user" is the account resetting its own
    // password via a public link, not an authenticated caller) - mirrors
    // AuthService's own LOGIN/LOGIN_FAILED pattern for anonymous events.
    await this.prisma.auditLog.create({
      data: {
        userId: token.userId,
        role: token.user.role,
        action: 'PASSWORD_RESET_COMPLETED',
        entity: 'User',
        entityId: token.userId,
        after: { sessionsInvalidatedBefore: changedAt.toISOString() },
      },
    });

    return { loginName: token.user.loginName };
  }

  private async logFailure(userId: string | null, tokenId: string | null, reason: string) {
    await this.prisma.auditLog.create({
      data: {
        userId: userId ?? undefined,
        action: 'PASSWORD_RESET_FAILED',
        entity: 'PasswordResetToken',
        entityId: tokenId ?? 'unknown',
        after: { reason },
      },
    });
  }
}
