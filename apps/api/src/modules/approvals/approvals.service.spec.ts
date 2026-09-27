import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { ApprovalsService } from './approvals.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * docs/09-BUSINESS-RULES.md section 9 (Team Lead Login Name Change requires
 * Manager Approval) - required-tests items 23-27: a Team Lead can request
 * a Coder Login Name change but never finalize it; a Team Lead can never
 * approve (including their own request); a Manager can Approve (which
 * applies the change) or Reject it; the whole lifecycle is audited.
 */
describe('ApprovalsService', () => {
  let service: ApprovalsService;
  let prisma: {
    approvalRequest: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; count: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let users: { changeLoginName: jest.Mock };

  const managerCaller: AuthUser = {
    id: 'manager-1',
    employeeId: 'EMP0001',
    loginName: 'manager.admin',
    email: 'm@smartclues.local',
    role: 'MANAGER',
    teamId: null,
    isActive: true,
  };

  const teamLeadCaller: AuthUser = {
    id: 'tl-1',
    employeeId: 'EMP0002',
    loginName: 'tl.one',
    email: 'tl@smartclues.local',
    role: 'TEAM_LEAD',
    teamId: 'team-1',
    isActive: true,
  };

  const otherTeamLeadCaller: AuthUser = { ...teamLeadCaller, id: 'tl-2', teamId: 'team-2' };

  const coderTarget = { id: 'coder-1', loginName: 'coder.one', role: 'CODER', teamId: 'team-1', fullName: 'Cody Coder', employeeId: 'EMP0500' };

  const requestRow = {
    id: 'req-1',
    type: 'LOGIN_NAME_CHANGE',
    status: 'PENDING',
    targetUserId: coderTarget.id,
    requestedById: teamLeadCaller.id,
    requestedAt: new Date('2026-09-01'),
    payload: { currentLoginName: 'coder.one', requestedLoginName: 'coder.renamed' },
    reviewedById: null,
    reviewedAt: null,
    rejectionReason: null,
    targetUser: coderTarget,
    requestedBy: { id: teamLeadCaller.id, fullName: 'TL One', employeeId: 'EMP0002', loginName: 'tl.one' },
    reviewedBy: null,
  };

  beforeEach(async () => {
    prisma = {
      approvalRequest: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    users = { changeLoginName: jest.fn().mockResolvedValue({ id: coderTarget.id, loginName: 'coder.renamed' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ApprovalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(ApprovalsService);
  });

  describe('requestLoginNameChange', () => {
    it('lets a Team Lead request a Login Name change for an own-team Coder', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(coderTarget);
      prisma.approvalRequest.create.mockResolvedValueOnce(requestRow);

      const result = await service.requestLoginNameChange(teamLeadCaller, coderTarget.id, { loginName: 'coder.renamed' });

      expect(result.status).toBe('PENDING');
      expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'LOGIN_NAME_CHANGE',
            status: 'PENDING',
            targetUserId: coderTarget.id,
            requestedById: teamLeadCaller.id,
            payload: { currentLoginName: 'coder.one', requestedLoginName: 'coder.renamed' },
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LOGIN_NAME_CHANGE_REQUESTED',
            // Regression guard for the Prisma InputJsonValue cast: the
            // audited `after` value must still be the same plain payload
            // object at runtime, not something the cast altered or dropped.
            after: { currentLoginName: 'coder.one', requestedLoginName: 'coder.renamed' },
          }),
        }),
      );
    });

    it('requests the created ApprovalRequest with the targetUser/requestedBy/reviewedBy relations included', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(coderTarget);
      prisma.approvalRequest.create.mockResolvedValueOnce(requestRow);

      await service.requestLoginNameChange(teamLeadCaller, coderTarget.id, { loginName: 'coder.renamed' });

      expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { targetUser: expect.anything(), requestedBy: expect.anything(), reviewedBy: expect.anything() },
        }),
      );
    });

    it('never finalizes the change directly - only creates a pending request', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(coderTarget);
      prisma.approvalRequest.create.mockResolvedValueOnce(requestRow);

      await service.requestLoginNameChange(teamLeadCaller, coderTarget.id, { loginName: 'coder.renamed' });

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(users.changeLoginName).not.toHaveBeenCalled();
    });

    it('rejects a non-Team-Lead caller', async () => {
      await expect(
        service.requestLoginNameChange(managerCaller, coderTarget.id, { loginName: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a Coder outside the Team Lead\'s own team', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(coderTarget);
      await expect(
        service.requestLoginNameChange(otherTeamLeadCaller, coderTarget.id, { loginName: 'coder.renamed' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a duplicate Login Name up front', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(coderTarget);
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'someone-else' });
      await expect(
        service.requestLoginNameChange(teamLeadCaller, coderTarget.id, { loginName: 'taken.name' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a second request while one is already pending', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(coderTarget);
      prisma.approvalRequest.findFirst.mockResolvedValueOnce(requestRow);
      await expect(
        service.requestLoginNameChange(teamLeadCaller, coderTarget.id, { loginName: 'coder.renamed' }),
      ).rejects.toThrow(ConflictException);
    });

    it('404s for a non-existent Coder', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.requestLoginNameChange(teamLeadCaller, 'missing', { loginName: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('lets a Manager list pending requests by default', async () => {
      prisma.approvalRequest.findMany.mockResolvedValueOnce([requestRow]);
      prisma.approvalRequest.count.mockResolvedValueOnce(1);
      const result = await service.list(managerCaller, { page: 1, pageSize: 25 } as any);
      expect(result.data).toHaveLength(1);
      expect(prisma.approvalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING' } }),
      );
    });

    it('rejects a non-Manager', async () => {
      await expect(service.list(teamLeadCaller, { page: 1, pageSize: 25 } as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approve', () => {
    it('lets a Manager approve, which applies the Login Name change', async () => {
      prisma.approvalRequest.findUnique.mockResolvedValueOnce(requestRow);
      prisma.approvalRequest.update.mockResolvedValueOnce({ ...requestRow, status: 'APPROVED', reviewedById: managerCaller.id, reviewedAt: new Date() });

      const result = await service.approve(managerCaller, 'req-1');

      expect(users.changeLoginName).toHaveBeenCalledWith(managerCaller, coderTarget.id, 'coder.renamed');
      expect(result.status).toBe('APPROVED');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'APPROVAL_APPROVED' }) }),
      );
    });

    it('rejects a Team Lead trying to approve (including their own request)', async () => {
      prisma.approvalRequest.findUnique.mockResolvedValueOnce(requestRow);
      await expect(service.approve(teamLeadCaller, 'req-1')).rejects.toThrow(ForbiddenException);
      expect(users.changeLoginName).not.toHaveBeenCalled();
    });

    it('rejects approving an already-decided request', async () => {
      prisma.approvalRequest.findUnique.mockResolvedValueOnce({ ...requestRow, status: 'APPROVED' });
      await expect(service.approve(managerCaller, 'req-1')).rejects.toThrow(ConflictException);
    });

    it('404s for a non-existent request', async () => {
      prisma.approvalRequest.findUnique.mockResolvedValueOnce(null);
      await expect(service.approve(managerCaller, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reject', () => {
    it('lets a Manager reject with a reason, and the change never applies', async () => {
      prisma.approvalRequest.findUnique.mockResolvedValueOnce(requestRow);
      prisma.approvalRequest.update.mockResolvedValueOnce({
        ...requestRow,
        status: 'REJECTED',
        reviewedById: managerCaller.id,
        reviewedAt: new Date(),
        rejectionReason: 'Not a valid new login name',
      });

      const result = await service.reject(managerCaller, 'req-1', 'Not a valid new login name');

      expect(users.changeLoginName).not.toHaveBeenCalled();
      expect(result.status).toBe('REJECTED');
      expect(result.rejectionReason).toBe('Not a valid new login name');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'APPROVAL_REJECTED' }) }),
      );
    });

    it('rejects a Team Lead trying to reject', async () => {
      prisma.approvalRequest.findUnique.mockResolvedValueOnce(requestRow);
      await expect(service.reject(teamLeadCaller, 'req-1', 'no')).rejects.toThrow(ForbiddenException);
    });
  });
});
