import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginNameAllocationService } from '../login-name-allocations/login-name-allocation.service';

/**
 * docs/09-BUSINESS-RULES.md section 11 (Phase 9) - Manager-only,
 * enterprise-wide, server-side paginated/filterable/searchable account
 * directory. Never returns passwordHash or any other credential/token
 * field.
 */
describe('EmployeesService', () => {
  let service: EmployeesService;
  let prisma: { user: { findMany: jest.Mock; count: jest.Mock; findUnique: jest.Mock } };
  let loginNameAllocations: { historyForUser: jest.Mock };

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

  const userRow = (over: Record<string, unknown> = {}) => ({
    id: 'coder-1',
    fullName: 'Cody Coder',
    employeeId: 'EMP0500',
    loginName: 'coder.one',
    email: 'cody@x.local',
    role: 'CODER',
    isActive: true,
    createdAt: new Date('2026-01-10'),
    vendor: null,
    vendorAssignments: [],
    team: { id: 'team-1', name: 'Team One', teamLead: { id: 'tl-1', fullName: 'TL One', loginName: 'tl.one' } },
    leadsTeam: null,
    ...over,
  });

  beforeEach(async () => {
    prisma = { user: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), findUnique: jest.fn() } };
    loginNameAllocations = { historyForUser: jest.fn().mockResolvedValue([]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: LoginNameAllocationService, useValue: loginNameAllocations },
      ],
    }).compile();
    service = moduleRef.get(EmployeesService);
  });

  describe('list', () => {
    it('lets a Manager search/paginate, mapping org placement and never leaking passwordHash', async () => {
      prisma.user.findMany.mockResolvedValueOnce([userRow()]);
      prisma.user.count.mockResolvedValueOnce(1);

      const result = await service.list(managerCaller, { page: 1, pageSize: 25, search: 'cody' } as any);

      expect(result.total).toBe(1);
      expect(result.data[0]).toMatchObject({ id: 'coder-1', loginName: 'coder.one', team: { id: 'team-1', name: 'Team One' }, teamLead: { id: 'tl-1' } });
      expect(result.data[0]).not.toHaveProperty('passwordHash');
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ AND: expect.anything() }),
          skip: 0,
          take: 25,
        }),
      );
      // select never asks Prisma for passwordHash/session-security fields in the first place.
      const selectArg = prisma.user.findMany.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty('passwordHash');
    });

    it('applies role/status/vendor/team filters server-side', async () => {
      await service.list(managerCaller, { page: 1, pageSize: 25, role: 'CODER', status: 'active', teamId: 'team-1' } as any);
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ role: 'CODER', isActive: true });
      expect(where.OR).toEqual(expect.arrayContaining([{ teamId: 'team-1' }]));
    });

    it('paginates with the requested page/pageSize', async () => {
      await service.list(managerCaller, { page: 3, pageSize: 10 } as any);
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
    });

    it('rejects a non-Manager', async () => {
      await expect(service.list(teamLeadCaller, { page: 1, pageSize: 25 } as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns full detail plus Login Name history for a Manager, still never leaking passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(userRow());
      loginNameAllocations.historyForUser.mockResolvedValueOnce([{ id: 'alloc-1', loginName: 'coder.one', status: 'ACTIVE', allocatedAt: new Date(), deallocatedAt: null }]);

      const result = await service.get(managerCaller, 'coder-1');

      expect(result.loginNameHistory).toHaveLength(1);
      expect(result).not.toHaveProperty('passwordHash');
      const selectArg = prisma.user.findUnique.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty('passwordHash');
    });

    it('404s for a non-existent employee', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.get(managerCaller, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects a non-Manager', async () => {
      await expect(service.get(teamLeadCaller, 'coder-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
