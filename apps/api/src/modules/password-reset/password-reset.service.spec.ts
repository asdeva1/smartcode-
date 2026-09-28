import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@smartcode/types';
import { PasswordResetService } from './password-reset.service';
import { PrismaService } from '../../prisma/prisma.service';
import { hashResetToken } from '../../common/reset-token';

/**
 * Covers docs/09-BUSINESS-RULES.md section 8 (Phase 8) required-tests A-S:
 * request-side scope (Vendor: own vendor only, Team Lead: own team only,
 * never Manager/unrelated), approve/reject authorization and effects,
 * the full token lifecycle (expired/used/invalid/revoked), the actual
 * password change + session invalidation, and that neither the raw token
 * nor the password hash ever leaks through a response or a log.
 */
describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let prisma: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    passwordResetRequest: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock; count: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    passwordResetToken: { updateMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  const REQUEST_INCLUDE_RESULT = {
    id: 'req-1',
    status: 'PENDING',
    reason: null,
    requestedAt: new Date(),
    reviewedAt: null,
    rejectionReason: null,
    targetUser: { id: 'coder-1', fullName: 'Cody Coder', employeeId: 'E-1', loginName: 'coder.one', email: 'c@x.local', role: 'CODER', vendorId: null, vendor: null, team: { id: 't1', name: 'Team A' } },
    requestedBy: { id: 'req-by', fullName: 'Req By', employeeId: 'E-2', loginName: 'req.by' },
    reviewedBy: null,
    tokens: [],
  };

  const managerCaller: AuthUser = { id: 'mgr-1', employeeId: 'E-M', loginName: 'mgr', email: 'm@x.local', role: 'MANAGER', teamId: null, isActive: true };
  const teamLeadCaller: AuthUser = { id: 'tl-1', employeeId: 'E-TL', loginName: 'tl', email: 'tl@x.local', role: 'TEAM_LEAD', teamId: 'team-1', isActive: true };
  const otherTeamLeadCaller: AuthUser = { ...teamLeadCaller, id: 'tl-2', teamId: 'team-2' };
  const vendorCaller: AuthUser = { id: 'ven-1', employeeId: 'E-V', loginName: 'ven', email: 'v@x.local', role: 'VENDOR', teamId: null, vendorId: 'vendor-1', isActive: true };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      passwordResetRequest: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      passwordResetToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost:3000') } },
      ],
    }).compile();

    service = moduleRef.get(PasswordResetService);
  });

  describe('request() - scope enforcement', () => {
    it('A: Vendor can request a reset for its own Vendor Coder', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'coder-1', role: 'CODER', teamId: null, vendorId: 'vendor-1' });
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'coder-1' }); // vendorCoderWhere match
      prisma.passwordResetRequest.findFirst.mockResolvedValueOnce(null);
      prisma.passwordResetRequest.create.mockResolvedValueOnce(REQUEST_INCLUDE_RESULT);

      const result = await service.request(vendorCaller, 'coder-1', {});
      expect(result.id).toBe('req-1');
      expect(prisma.passwordResetRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ targetUserId: 'coder-1', requestedById: vendorCaller.id }) }),
      );
    });

    it('B: Vendor cannot request a reset for another Vendor\'s Coder', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'coder-2', role: 'CODER', teamId: null, vendorId: 'vendor-2' });
      prisma.user.findFirst.mockResolvedValueOnce(null); // vendorCoderWhere: no match for vendor-1
      await expect(service.request(vendorCaller, 'coder-2', {})).rejects.toThrow(ForbiddenException);
      expect(prisma.passwordResetRequest.create).not.toHaveBeenCalled();
    });

    it('C: Vendor cannot request a reset for a Manager', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'mgr-2', role: 'MANAGER', teamId: null, vendorId: null });
      prisma.user.findFirst.mockResolvedValueOnce(null); // vendorCoderWhere only ever matches role CODER
      await expect(service.request(vendorCaller, 'mgr-2', {})).rejects.toThrow(ForbiddenException);
      expect(prisma.passwordResetRequest.create).not.toHaveBeenCalled();
    });

    it('D: Vendor cannot request a reset for an unrelated internal employee', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'coder-3', role: 'CODER', teamId: 'team-9', vendorId: null });
      prisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(service.request(vendorCaller, 'coder-3', {})).rejects.toThrow(ForbiddenException);
    });

    it('E: Team Lead can request a reset for a permitted own-team Coder', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'coder-1', role: 'CODER', teamId: 'team-1' });
      prisma.passwordResetRequest.findFirst.mockResolvedValueOnce(null);
      prisma.passwordResetRequest.create.mockResolvedValueOnce(REQUEST_INCLUDE_RESULT);

      const result = await service.request(teamLeadCaller, 'coder-1', { reason: 'forgot password' });
      expect(result.id).toBe('req-1');
    });

    it('F: Team Lead cannot request a reset for another Team Lead\'s Coder', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'coder-1', role: 'CODER', teamId: 'team-1' });
      await expect(service.request(otherTeamLeadCaller, 'coder-1', {})).rejects.toThrow(ForbiddenException);
      expect(prisma.passwordResetRequest.create).not.toHaveBeenCalled();
    });

    it('G: Team Lead cannot request a reset for a Manager', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'mgr-2', role: 'MANAGER', teamId: null });
      await expect(service.request(teamLeadCaller, 'mgr-2', {})).rejects.toThrow(ForbiddenException);
    });

    it('rejects a duplicate pending request for the same target', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'coder-1', role: 'CODER', teamId: 'team-1' });
      prisma.passwordResetRequest.findFirst.mockResolvedValueOnce({ id: 'existing-pending' });
      await expect(service.request(teamLeadCaller, 'coder-1', {})).rejects.toThrow(ConflictException);
    });
  });

  describe('approve()/reject() - Manager-only', () => {
    it('H: a non-Manager cannot approve or reject', async () => {
      await expect(service.approve(teamLeadCaller, 'req-1')).rejects.toThrow(ForbiddenException);
      await expect(service.reject(teamLeadCaller, 'req-1', 'no')).rejects.toThrow(ForbiddenException);
      await expect(service.approve(vendorCaller, 'req-1')).rejects.toThrow(ForbiddenException);
    });

    it('I: Manager can approve - generates a token and returns a one-time reset URL', async () => {
      prisma.passwordResetRequest.findUnique.mockResolvedValueOnce({ id: 'req-1', status: 'PENDING', targetUserId: 'coder-1' });
      prisma.passwordResetToken.create.mockResolvedValueOnce({ id: 'tok-1' });
      prisma.passwordResetRequest.update.mockResolvedValueOnce({ ...REQUEST_INCLUDE_RESULT, status: 'APPROVED' });

      const result = await service.approve(managerCaller, 'req-1');
      expect(result.request.status).toBe('APPROVED');
      expect(result.resetUrl).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=.+/);
      // Q: the raw token in the URL is never what got persisted.
      const rawToken = new URL(result.resetUrl).searchParams.get('token')!;
      const storedHash = prisma.passwordResetToken.create.mock.calls[0][0].data.tokenHash;
      expect(storedHash).toBe(hashResetToken(rawToken));
      expect(storedHash).not.toBe(rawToken);
    });

    it('J: Manager can reject - no token is ever generated', async () => {
      prisma.passwordResetRequest.findUnique.mockResolvedValueOnce({ id: 'req-1', status: 'PENDING', targetUserId: 'coder-1' });
      prisma.passwordResetRequest.update.mockResolvedValueOnce({ ...REQUEST_INCLUDE_RESULT, status: 'REJECTED', rejectionReason: 'not needed' });

      const result = await service.reject(managerCaller, 'req-1', 'not needed');
      expect(result.status).toBe('REJECTED');
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('rejects approving/rejecting a request that is not PENDING', async () => {
      prisma.passwordResetRequest.findUnique.mockResolvedValueOnce({ id: 'req-1', status: 'APPROVED', targetUserId: 'coder-1' });
      await expect(service.approve(managerCaller, 'req-1')).rejects.toThrow(ConflictException);
    });

    it('K: a rejected request never has a usable token (validate() on any token tied to it is invalid)', async () => {
      // No token row exists at all for a rejected request - validate() must
      // report invalid rather than ever synthesizing a usable one.
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce(null);
      const result = await service.validate('never-issued');
      expect(result).toEqual({ valid: false, reason: 'invalid' });
    });
  });

  describe('validate()/complete() - token lifecycle', () => {
    const baseToken = (over: Record<string, unknown> = {}) => ({
      id: 'tok-1',
      userId: 'coder-1',
      requestId: 'req-1',
      tokenHash: hashResetToken('raw-token'),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      invalidatedAt: null,
      request: { status: 'APPROVED' },
      user: { id: 'coder-1', loginName: 'coder.one', role: 'CODER' },
      ...over,
    });

    it('L: an expired token cannot reset the password', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce(baseToken({ expiresAt: new Date(Date.now() - 1000) }));
      await expect(service.complete('raw-token', 'NewPassword1!')).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'PASSWORD_RESET_FAILED', after: { reason: 'expired' } }) }));
    });

    it('M: a used token cannot be reused', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce(baseToken({ usedAt: new Date() }));
      await expect(service.complete('raw-token', 'NewPassword1!')).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('a revoked/invalidated token cannot reset the password', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce(baseToken({ invalidatedAt: new Date() }));
      await expect(service.complete('raw-token', 'NewPassword1!')).rejects.toThrow(ConflictException);
    });

    it('N: an invalid (unknown) token cannot reset the password', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce(null);
      await expect(service.complete('not-a-real-token', 'NewPassword1!')).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('a token whose request was rejected cannot reset the password even before expiry', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce(baseToken({ request: { status: 'REJECTED' } }));
      await expect(service.complete('raw-token', 'NewPassword1!')).rejects.toThrow(NotFoundException);
    });

    it('O/P/Q/R/S: a successful reset changes the password, invalidates prior sessions, never leaks the raw token or the hash', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce(baseToken());
      prisma.user.update.mockResolvedValueOnce({});
      prisma.passwordResetToken.update.mockResolvedValueOnce({});
      prisma.passwordResetRequest.update.mockResolvedValueOnce({});

      const before = Date.now();
      const result = await service.complete('raw-token', 'NewPassword1!');

      // O: password actually changed, Argon2-hashed.
      const userUpdateData = prisma.user.update.mock.calls[0][0].data;
      expect(userUpdateData.passwordHash).toMatch(/^\$argon2/);
      expect(userUpdateData.passwordHash).not.toContain('NewPassword1!');
      // P: passwordChangedAt bumped - the existing mechanism that rejects every earlier-issued token.
      expect(userUpdateData.passwordChangedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(userUpdateData.failedLoginCount).toBe(0);
      expect(userUpdateData.lockedUntil).toBeNull();

      // Token marked used, sibling tokens invalidated, request marked COMPLETED.
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({ where: { id: 'tok-1' }, data: { usedAt: expect.any(Date) } });
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'coder-1', id: { not: 'tok-1' } }) }),
      );
      expect(prisma.passwordResetRequest.update).toHaveBeenCalledWith({ where: { id: 'req-1' }, data: { status: 'COMPLETED' } });

      // S: only a non-sensitive shape is returned - never a password/hash.
      expect(result).toEqual({ loginName: 'coder.one' });

      // Q/R: neither the raw token nor the password/hash ever appears in any audit-log call.
      const loggedPayloads = JSON.stringify(prisma.auditLog.create.mock.calls);
      expect(loggedPayloads).not.toContain('raw-token');
      expect(loggedPayloads).not.toContain('NewPassword1!');
      expect(loggedPayloads).not.toContain(userUpdateData.passwordHash);
    });
  });
});
