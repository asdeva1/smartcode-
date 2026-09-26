import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeamLeadDto } from './dto/create-team-lead.dto';

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
    fullName: 'New User',
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

  it('rejects a duplicate login name with ConflictException and does not create a row', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'existing-1' });
    await expect(service.createWithRole(managerCaller, 'TEAM_LEAD', dto)).rejects.toThrow(
      'A user with this login name, employee ID, or email already exists',
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate employee ID the same way (same uniqueness check covers both)', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'existing-2' });
    await expect(service.createWithRole(managerCaller, 'TEAM_LEAD', dto)).rejects.toThrow(
      'A user with this login name, employee ID, or email already exists',
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('hashes the password before persisting - never stores it in plaintext', async () => {
    prisma.user.create.mockResolvedValue({ id: 'new-3', ...dto, role: 'TEAM_LEAD', passwordHash: 'x' });
    await service.createWithRole(managerCaller, 'TEAM_LEAD', dto);
    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data.passwordHash).toBeDefined();
    expect(createArg.data.passwordHash).not.toBe(dto.password);
    expect(createArg.data.passwordHash.startsWith('$argon2')).toBe(true);
  });

  it('never returns passwordHash on the created account', async () => {
    prisma.user.create.mockResolvedValue({
      id: 'new-4',
      ...dto,
      role: 'TEAM_LEAD',
      passwordHash: '$argon2id$fake',
    });
    const result = await service.createWithRole(managerCaller, 'TEAM_LEAD', dto);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('forces the created account role to TEAM_LEAD regardless of what else is passed', async () => {
    prisma.user.create.mockResolvedValue({ id: 'new-5', ...dto, role: 'TEAM_LEAD', passwordHash: 'x' });
    await service.createWithRole(managerCaller, 'TEAM_LEAD', dto);
    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data.role).toBe('TEAM_LEAD');
  });
});

/**
 * Team Lead Management module - findTeamLeads, updateTeamLead, and
 * setActive's Team-Lead-specific behavior. Separate describe block with
 * its own, more complete Prisma mock so the suite above (which predates
 * this module) doesn't need to change shape.
 */
describe('UsersService - Team Lead management', () => {
  let service: UsersService;
  let prisma: {
    auditLog: { create: jest.Mock };
    user: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    team: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
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

  const existingTeamLead = {
    id: 'tl-99',
    employeeId: 'EMP0099',
    loginName: 'tl.ninetynine',
    email: 'tl99@smartclues.local',
    fullName: 'Existing TL',
    role: 'TEAM_LEAD',
    isActive: true,
    teamId: null,
    createdAt: new Date('2026-01-01'),
    team: null,
  };

  beforeEach(async () => {
    prisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(existingTeamLead),
        findMany: jest.fn().mockResolvedValue([existingTeamLead]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(existingTeamLead),
      },
      team: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('lets a Manager list Team Leads, paginated', async () => {
    const result = await service.findTeamLeads(managerCaller, {
      page: 1,
      pageSize: 25,
      status: 'all',
    } as any);
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ role: 'TEAM_LEAD' }) }),
    );
  });

  it('rejects a non-Manager listing Team Leads', async () => {
    await expect(
      service.findTeamLeads(teamLeadCaller, { page: 1, pageSize: 25, status: 'all' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets a Manager deactivate a Team Lead', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ ...existingTeamLead, isActive: true });
    prisma.user.update.mockResolvedValueOnce({ ...existingTeamLead, isActive: false, passwordHash: 'x' });
    const result = await service.setActive(managerCaller, existingTeamLead.id, false);
    expect(result.isActive).toBe(false);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'TEAM_LEAD_DEACTIVATED' }) }),
    );
  });

  it('lets a Manager activate a Team Lead', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ ...existingTeamLead, isActive: false });
    prisma.user.update.mockResolvedValueOnce({ ...existingTeamLead, isActive: true, passwordHash: 'x' });
    const result = await service.setActive(managerCaller, existingTeamLead.id, true);
    expect(result.isActive).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'TEAM_LEAD_ACTIVATED' }) }),
    );
  });

  it('rejects a Team Lead trying to activate/deactivate another Team Lead', async () => {
    await expect(service.setActive(teamLeadCaller, existingTeamLead.id, false)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a non-Manager editing a Team Lead', async () => {
    await expect(
      service.updateTeamLead(teamLeadCaller, existingTeamLead.id, { fullName: 'x' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets a Manager edit a Team Lead\'s profile fields', async () => {
    prisma.user.update.mockResolvedValueOnce({ ...existingTeamLead, fullName: 'Updated Name' });
    const result = await service.updateTeamLead(managerCaller, existingTeamLead.id, {
      fullName: 'Updated Name',
    });
    expect(result.fullName).toBe('Updated Name');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'TEAM_LEAD_UPDATED' }) }),
    );
  });
});

/**
 * Create Team Lead - confirmPassword contract. The web form sends
 * confirmPassword (and teamId, possibly null); these tests run the DTO
 * through a ValidationPipe configured exactly like main.ts
 * (whitelist + forbidNonWhitelisted + transform), so an undeclared field
 * would fail here the same way it would fail with HTTP 400 in production.
 */
describe('Create Team Lead - confirmPassword', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const toDto = (body: Record<string, unknown>) =>
    pipe.transform(body, { type: 'body', metatype: CreateTeamLeadDto }) as Promise<CreateTeamLeadDto>;
  const messagesFor = async (body: Record<string, unknown>): Promise<string[]> => {
    try {
      await toDto(body);
      return [];
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      return ((e as BadRequestException).getResponse() as { message: string[] }).message;
    }
  };

  const TEAM_ID = '7b0c7f7e-3a5b-4c1e-9d2a-1f2e3d4c5b6a';

  /** Exactly the shape CreateTeamLeadDialog submits. */
  const formPayload = {
    employeeId: 'EMP0500',
    fullName: 'Tara Lead',
    loginName: 'tara.lead',
    email: 'tara.lead@smartclues.local',
    password: 'SuperSecret123!',
    confirmPassword: 'SuperSecret123!',
    teamId: null as string | null,
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

  describe('DTO validation (production ValidationPipe settings)', () => {
    it('accepts the full form payload including confirmPassword and a null teamId', async () => {
      const dto = await toDto(formPayload);
      expect(dto).toBeInstanceOf(CreateTeamLeadDto);
      expect(dto.confirmPassword).toBe('SuperSecret123!');
    });

    it('accepts the full form payload with a team selected', async () => {
      await expect(toDto({ ...formPayload, teamId: TEAM_ID })).resolves.toMatchObject({ teamId: TEAM_ID });
    });

    it('rejects a password / confirmPassword mismatch', async () => {
      expect(await messagesFor({ ...formPayload, confirmPassword: 'Different123!' })).toEqual([
        'Passwords do not match',
      ]);
    });

    it('rejects a missing confirmPassword', async () => {
      const { confirmPassword: _omit, ...withoutConfirm } = formPayload;
      expect(await messagesFor(withoutConfirm)).toEqual(
        expect.arrayContaining(['Passwords do not match', 'confirmPassword must be a string']),
      );
    });

    it('keeps the existing password policy - a short password is rejected even when both fields match', async () => {
      expect(await messagesFor({ ...formPayload, password: 'short', confirmPassword: 'short' })).toEqual([
        'Password must be at least 8 characters',
      ]);
    });

    it('still rejects undeclared fields (forbidNonWhitelisted is not weakened)', async () => {
      expect(await messagesFor({ ...formPayload, role: 'MANAGER' })).toEqual(['property role should not exist']);
    });
  });

  describe('UsersService.createTeamLead', () => {
    let service: UsersService;
    let prisma: {
      auditLog: { create: jest.Mock };
      user: { findFirst: jest.Mock; create: jest.Mock; findUnique: jest.Mock };
      team: { findUnique: jest.Mock; update: jest.Mock };
    };

    beforeEach(async () => {
      prisma = {
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({ id: 'tl-new', isActive: true, createdAt: new Date('2026-03-01'), ...data }),
          ),
          findUnique: jest.fn(),
        },
        team: {
          findUnique: jest.fn().mockResolvedValue({ id: TEAM_ID, name: 'Team Alpha', teamLeadId: null }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      prisma.user.findUnique.mockImplementation(() => {
        const created = prisma.user.create.mock.results[0]?.value;
        return created.then((row: object) => ({ ...row, team: null }));
      });

      const moduleRef = await Test.createTestingModule({
        providers: [UsersService, { provide: PrismaService, useValue: prisma }],
      }).compile();
      service = moduleRef.get(UsersService);
    });

    it('creates a Team Lead from a validated form payload', async () => {
      const result = await service.createTeamLead(managerCaller, await toDto(formPayload));

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        id: 'tl-new',
        employeeId: 'EMP0500',
        fullName: 'Tara Lead',
        loginName: 'tara.lead',
        email: 'tara.lead@smartclues.local',
        role: 'TEAM_LEAD',
        isActive: true,
        team: null,
      });
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('confirmPassword');
      expect(prisma.team.update).not.toHaveBeenCalled();
    });

    it('never persists or logs confirmPassword (nor the plaintext password)', async () => {
      await service.createTeamLead(managerCaller, await toDto(formPayload));

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(Object.keys(data).sort()).toEqual(
        ['createdById', 'email', 'employeeId', 'fullName', 'loginName', 'passwordHash', 'role', 'teamId'].sort(),
      );
      expect(data).not.toHaveProperty('confirmPassword');
      expect(data).not.toHaveProperty('password');
      expect(data.passwordHash).not.toBe(formPayload.password);

      const logged = JSON.stringify(prisma.auditLog.create.mock.calls);
      expect(logged).not.toContain('confirmPassword');
      expect(logged).not.toContain(formPayload.password);
    });

    it('still assigns the selected team (existing business rule unchanged)', async () => {
      await service.createTeamLead(managerCaller, await toDto({ ...formPayload, teamId: TEAM_ID }));

      expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty('confirmPassword');
      expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: TEAM_ID }, data: { teamLeadId: 'tl-new' } });
    });
  });
});
