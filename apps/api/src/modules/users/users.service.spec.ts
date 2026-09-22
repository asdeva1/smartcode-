import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Exercises UsersService.createWithRole directly - the actual code path
 * a request hits after RolesGuard passes, proving the backend rejects a
 * disallowed creation even if a route-level guard were ever misconfigured
 * or bypassed. This is deliberately a second, independent check on top of
 * hierarchy.spec.ts (which only tests the pure canCreateRole() function) -
 * see docs/03-RBAC-PERMISSIONS.md "Enforcement Model": coarse (route) and
 * fine (service) checks are both real, so both are tested.
 */
describe('UsersService.createWithRole - server-side enforcement', () => {
  let service: UsersService;
  let prisma: {
    auditLog: { create: jest.Mock };
    user: { findFirst: jest.Mock; create: jest.Mock };
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

  const teamLeadCaller: AuthUser = {
    id: 'tl-1',
    employeeId: 'EMP0002',
    loginName: 'tl.one',
    email: 'tl@smartclues.local',
    role: 'TEAM_LEAD',
    teamId: 'team-1',
    isActive: true,
  };

  const dto = {
    employeeId: 'EMP9999',
    loginName: 'new.user',
    email: 'new.user@smartclues.local',
    password: 'SuperSecret123!',
  };

  beforeEach(async () => {
    prisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('rejects a Team Lead attempting to create another Team Lead, and logs the denial', async () => {
    await expect(service.createWithRole(teamLeadCaller, 'TEAM_LEAD', dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'USER_CREATE_DENIED' }),
      }),
    );
  });

  it('rejects a Team Lead attempting to create an Auditor', async () => {
    await expect(service.createWithRole(teamLeadCaller, 'AUDITOR', dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects a Manager attempting to create a Coder directly (must go through a Team Lead)', async () => {
    await expect(service.createWithRole(managerCaller, 'CODER', dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('allows a Manager to create a Team Lead and persists it', async () => {
    prisma.user.create.mockResolvedValue({ id: 'new-1', ...dto, role: 'TEAM_LEAD', passwordHash: 'x' });
    await service.createWithRole(managerCaller, 'TEAM_LEAD', dto);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data.role).toBe('TEAM_LEAD');
    expect(createArg.data.createdById).toBe(managerCaller.id);
  });

  it('allows a Team Lead to create a Coder and auto-assigns the caller\'s team', async () => {
    prisma.user.create.mockResolvedValue({ id: 'new-2', ...dto, role: 'CODER', passwordHash: 'x' });
    await service.createWithRole(teamLeadCaller, 'CODER', dto);
    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data.role).toBe('CODER');
    expect(createArg.data.teamId).toBe(teamLeadCaller.teamId);
  });
});
