import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { LoginNameAllocationService } from './login-name-allocation.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * docs/09-BUSINESS-RULES.md section 10 (Phase 9) - LoginNameAllocation is
 * an append-only ledger: at most one ACTIVE allocation per Login Name and
 * per User at any time, reassignment closes the old row and opens a new
 * one (never updates/deletes history), and only a Manager may search it.
 */
describe('LoginNameAllocationService', () => {
  let service: LoginNameAllocationService;
  let prisma: {
    loginNameAllocation: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  const managerCaller: AuthUser = {
    id: 'manager-1',
    employeeId: 'EMP0001',
    loginName: 'manager.admin',
    email: 'm@smartclues.local',
    role: 'MANAGER',
    teamId: null,
    isActive: true,
  };
  const teamLeadCaller: AuthUser = { ...managerCaller, id: 'tl-1', role: 'TEAM_LEAD', teamId: 'team-1' };

  const allocationRow = (over: Record<string, unknown> = {}) => ({
    id: 'alloc-1',
    loginName: 'coder.one',
    employeeId: 'EMP0500',
    status: 'ACTIVE',
    allocatedAt: new Date('2026-01-10'),
    deallocatedAt: null,
    reason: null,
    allocatedBy: { id: 'manager-1', fullName: 'Manager One', employeeId: 'EMP0001', loginName: 'manager.admin' },
    deallocatedBy: null,
    user: {
      id: 'coder-1',
      fullName: 'Cody Coder',
      employeeId: 'EMP0500',
      loginName: 'coder.one',
      role: 'CODER',
      isActive: true,
      vendor: null,
      team: { id: 'team-1', name: 'Team One', teamLead: { id: 'tl-1', fullName: 'TL One', loginName: 'tl.one' } },
      leadsTeam: null,
      vendorAssignments: [],
    },
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      loginNameAllocation: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [LoginNameAllocationService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(LoginNameAllocationService);
  });

  describe('reallocate', () => {
    it('creates the first allocation for a user with no current one (no close step)', async () => {
      prisma.loginNameAllocation.findFirst.mockResolvedValueOnce(null); // no cross-user conflict
      prisma.loginNameAllocation.findFirst.mockResolvedValueOnce(null); // no current allocation
      prisma.loginNameAllocation.create.mockResolvedValueOnce(allocationRow());

      await service.reallocate(prisma as any, {
        targetUserId: 'coder-1',
        employeeId: 'EMP0500',
        newLoginName: 'coder.one',
        actor: managerCaller,
      });

      expect(prisma.loginNameAllocation.update).not.toHaveBeenCalled();
      expect(prisma.loginNameAllocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ loginName: 'coder.one', userId: 'coder-1', employeeId: 'EMP0500', status: 'ACTIVE', allocatedById: managerCaller.id }),
        }),
      );
    });

    it('closes the old ACTIVE allocation (REALLOCATED, deallocatedAt/deallocatedById set) before creating the new one', async () => {
      const current = allocationRow({ id: 'alloc-old', loginName: 'coder.old' });
      prisma.loginNameAllocation.findFirst.mockResolvedValueOnce(null); // no cross-user conflict on the new name
      prisma.loginNameAllocation.findFirst.mockResolvedValueOnce(current); // current allocation exists
      prisma.loginNameAllocation.create.mockResolvedValueOnce(allocationRow({ id: 'alloc-new', loginName: 'coder.new' }));

      await service.reallocate(prisma as any, {
        targetUserId: 'coder-1',
        employeeId: 'EMP0500',
        newLoginName: 'coder.new',
        actor: managerCaller,
        reason: 'Approved change',
      });

      expect(prisma.loginNameAllocation.update).toHaveBeenCalledWith({
        where: { id: 'alloc-old' },
        data: expect.objectContaining({ status: 'REALLOCATED', deallocatedById: managerCaller.id }),
      });
      expect(prisma.loginNameAllocation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ loginName: 'coder.new', reason: 'Approved change' }) }),
      );
      // Never deletes or overwrites the old row - only status/deallocation fields change.
      expect(prisma.loginNameAllocation.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ loginName: expect.anything() }) }));
    });

    it('prevents allocating a Login Name that another user already holds ACTIVE', async () => {
      prisma.loginNameAllocation.findFirst.mockResolvedValueOnce(allocationRow({ user: { ...allocationRow().user, id: 'someone-else' } }));

      await expect(
        service.reallocate(prisma as any, { targetUserId: 'coder-1', employeeId: 'EMP0500', newLoginName: 'taken.name', actor: managerCaller }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.loginNameAllocation.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('defaults to the ACTIVE directory for a Manager', async () => {
      prisma.loginNameAllocation.findMany.mockResolvedValueOnce([allocationRow()]);
      prisma.loginNameAllocation.count.mockResolvedValueOnce(1);

      const result = await service.list(managerCaller, { page: 1, pageSize: 25 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ loginName: 'coder.one', status: 'ACTIVE' });
      expect(prisma.loginNameAllocation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }));
    });

    it('rejects a non-Manager', async () => {
      await expect(service.list(teamLeadCaller, { page: 1, pageSize: 25 } as any)).rejects.toThrow(ForbiddenException);
    });

    it('renders a backfilled row (allocatedBy: null) without erroring - never a fabricated actor', async () => {
      prisma.loginNameAllocation.findMany.mockResolvedValueOnce([allocationRow({ allocatedBy: null, reason: 'INITIAL_BACKFILL: system-generated at Phase 9 rollout' })]);
      prisma.loginNameAllocation.count.mockResolvedValueOnce(1);

      const result = await service.list(managerCaller, { page: 1, pageSize: 25 } as any);

      expect(result.data[0].allocatedBy).toBeNull();
      expect(result.data[0].reason).toMatch(/INITIAL_BACKFILL/);
    });
  });

  describe('getByLoginName', () => {
    it('returns the current allocation plus complete history for a Manager', async () => {
      const older = allocationRow({ id: 'alloc-0', status: 'REALLOCATED', allocatedAt: new Date('2026-01-01') });
      const current = allocationRow({ id: 'alloc-1', status: 'ACTIVE', allocatedAt: new Date('2026-05-01') });
      prisma.loginNameAllocation.findMany.mockResolvedValueOnce([current, older]);

      const result = await service.getByLoginName(managerCaller, 'coder.one');

      expect(result.current).toMatchObject({ id: 'alloc-1', status: 'ACTIVE' });
      expect(result.history).toHaveLength(2);
    });

    it('404s when nothing has ever been allocated to this exact Login Name', async () => {
      prisma.loginNameAllocation.findMany.mockResolvedValueOnce([]);
      await expect(service.getByLoginName(managerCaller, 'never.existed')).rejects.toThrow(NotFoundException);
    });

    it('rejects a non-Manager', async () => {
      await expect(service.getByLoginName(teamLeadCaller, 'coder.one')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('historyForUser', () => {
    it('rejects a non-Manager', async () => {
      await expect(service.historyForUser(teamLeadCaller, 'coder-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
