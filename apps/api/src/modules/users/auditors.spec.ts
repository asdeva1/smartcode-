import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthUser, Role } from '@smartcode/types';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { CreateAuditorDto } from './dto/create-auditor.dto';
import { UpdateAuditorDto } from './dto/update-auditor.dto';

const caller = (role: Role, overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: `${role.toLowerCase()}-1`,
  employeeId: `EMP-${role}`,
  loginName: `${role.toLowerCase()}.user`,
  email: `${role.toLowerCase()}@smartclues.local`,
  role,
  teamId: role === 'TEAM_LEAD' || role === 'CODER' ? 'team-1' : null,
  isActive: true,
  ...overrides,
});

const manager = caller('MANAGER');
const teamLead = caller('TEAM_LEAD');
const coder = caller('CODER');
const auditor = caller('AUDITOR');

const existingAuditor = {
  id: 'aud-1',
  employeeId: 'EMP0300',
  loginName: 'alex.auditor',
  email: 'alex.auditor@smartclues.local',
  fullName: 'Alex Auditor',
  role: 'AUDITOR',
  isActive: true,
  teamId: null,
  passwordHash: 'hashed',
  failedLoginCount: 0,
  lockedUntil: null,
  createdAt: new Date('2026-02-01'),
};

const validCreate = {
  employeeId: 'EMP0301',
  fullName: 'New Auditor',
  loginName: 'new.auditor',
  email: 'new.auditor@smartclues.local',
  password: 'SuperSecret123!',
  confirmPassword: 'SuperSecret123!',
};

describe('UsersService - Auditor management', () => {
  let service: UsersService;
  let prisma: {
    auditLog: { create: jest.Mock };
    user: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(existingAuditor),
        findMany: jest.fn().mockResolvedValue([existingAuditor]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'aud-new', isActive: true, createdAt: new Date(), ...data }),
        ),
        update: jest.fn().mockResolvedValue(existingAuditor),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('create', () => {
    it('lets a Manager create an Auditor with role AUDITOR, hashed password and no confirmPassword persisted', async () => {
      const result = await service.createAuditor(manager, validCreate);

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.role).toBe('AUDITOR');
      expect(data.passwordHash).toBeDefined();
      expect(data.passwordHash).not.toBe(validCreate.password);
      expect(data).not.toHaveProperty('password');
      expect(data).not.toHaveProperty('confirmPassword');
      expect(data.createdById).toBe(manager.id);
      expect(data.teamId).toBeUndefined();

      expect(result).toMatchObject({ role: 'AUDITOR', loginName: 'new.auditor', isActive: true });
      expect(result).not.toHaveProperty('passwordHash');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'USER_CREATED', userId: manager.id }) }),
      );
    });

    it.each([
      ['Team Lead', teamLead],
      ['Coder', coder],
      ['Auditor', auditor],
    ])('rejects a %s creating an Auditor and logs the denial', async (_label, who) => {
      await expect(service.createAuditor(who, validCreate)).rejects.toThrow(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'USER_CREATE_DENIED' }) }),
      );
    });

    it.each(['employee ID', 'login name', 'email'])(
      'rejects a duplicate %s with ConflictException',
      async () => {
        prisma.user.findFirst.mockResolvedValueOnce(existingAuditor);
        await expect(service.createAuditor(manager, validCreate)).rejects.toThrow(ConflictException);
        expect(prisma.user.create).not.toHaveBeenCalled();
      },
    );

    it('checks employee ID, login name and email together for uniqueness', async () => {
      await service.createAuditor(manager, validCreate);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { loginName: validCreate.loginName },
            { employeeId: validCreate.employeeId },
            { email: validCreate.email },
          ],
        },
      });
    });
  });

  describe('list', () => {
    it('lets a Manager list Auditors, paginated, filtered to role AUDITOR only', async () => {
      const result = await service.findAuditors(manager, { page: 2, pageSize: 10 });

      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.where.role).toBe('AUDITOR');
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
      expect(prisma.user.count).toHaveBeenCalledWith({ where: args.where });
      expect(result).toEqual({
        data: [
          {
            id: 'aud-1',
            employeeId: 'EMP0300',
            loginName: 'alex.auditor',
            email: 'alex.auditor@smartclues.local',
            fullName: 'Alex Auditor',
            role: 'AUDITOR',
            isActive: true,
            createdAt: existingAuditor.createdAt,
          },
        ],
        total: 1,
        page: 2,
        pageSize: 10,
      });
    });

    it('never widens the role filter when searching', async () => {
      await service.findAuditors(manager, { page: 1, pageSize: 25, search: '  alex ' });

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.role).toBe('AUDITOR');
      expect(where.OR).toEqual([
        { fullName: { contains: 'alex', mode: 'insensitive' } },
        { loginName: { contains: 'alex', mode: 'insensitive' } },
        { employeeId: { contains: 'alex', mode: 'insensitive' } },
        { email: { contains: 'alex', mode: 'insensitive' } },
      ]);
    });

    it('ignores a blank search', async () => {
      await service.findAuditors(manager, { page: 1, pageSize: 25, search: '   ' });
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ role: 'AUDITOR' });
    });

    it.each([
      ['Team Lead', teamLead],
      ['Coder', coder],
      ['Auditor', auditor],
    ])('rejects a %s listing Auditors', async (_label, who) => {
      await expect(service.findAuditors(who, { page: 1, pageSize: 25 })).rejects.toThrow(ForbiddenException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('lets a Manager edit employee ID, full name and email, and logs it', async () => {
      prisma.user.update.mockResolvedValueOnce({ ...existingAuditor, fullName: 'Renamed', email: 'r@smartclues.local' });

      const result = await service.updateAuditor(manager, 'aud-1', {
        fullName: 'Renamed',
        email: 'r@smartclues.local',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'aud-1' },
        data: { fullName: 'Renamed', email: 'r@smartclues.local' },
      });
      expect(result.fullName).toBe('Renamed');
      expect(result).not.toHaveProperty('passwordHash');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'USER_UPDATED', entityId: 'aud-1' }) }),
      );
    });

    it('never passes loginName or role through to the database, even if smuggled in', async () => {
      await service.updateAuditor(manager, 'aud-1', {
        fullName: 'Renamed',
        loginName: 'hijack',
        role: 'MANAGER',
      } as unknown as UpdateAuditorDto);

      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data).toEqual({ fullName: 'Renamed' });
    });

    it('rejects a duplicate employee ID or email belonging to another user', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'someone-else' });
      await expect(service.updateAuditor(manager, 'aud-1', { email: 'taken@smartclues.local' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: { not: 'aud-1' }, OR: [{ email: 'taken@smartclues.local' }] },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns 404 when the target is not an Auditor', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...existingAuditor, role: 'TEAM_LEAD' });
      await expect(service.updateAuditor(manager, 'aud-1', { fullName: 'x' })).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it.each([
      ['Team Lead', teamLead],
      ['Coder', coder],
      ['Auditor', auditor],
    ])('rejects a %s editing an Auditor', async (_label, who) => {
      await expect(service.updateAuditor(who, 'aud-1', { fullName: 'x' })).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('activate / deactivate (existing generic endpoints)', () => {
    it('lets a Manager deactivate an Auditor', async () => {
      prisma.user.update.mockResolvedValueOnce({ ...existingAuditor, isActive: false });
      const result = await service.setActive(manager, 'aud-1', false);
      expect(result.isActive).toBe(false);
      expect(result).not.toHaveProperty('passwordHash');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'USER_DEACTIVATED' }) }),
      );
    });

    it('lets a Manager activate an Auditor', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...existingAuditor, isActive: false });
      prisma.user.update.mockResolvedValueOnce({ ...existingAuditor, isActive: true });
      const result = await service.setActive(manager, 'aud-1', true);
      expect(result.isActive).toBe(true);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'USER_ACTIVATED' }) }),
      );
    });

    it.each([
      ['Team Lead', teamLead],
      ['Coder', coder],
      ['Auditor', auditor],
    ])('rejects a %s changing an Auditor\'s status', async (_label, who) => {
      await expect(service.setActive(who, 'aud-1', false)).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});

describe('Auditor DTO validation', () => {
  const errorsFor = async <T extends object>(cls: new () => T, body: Record<string, unknown>) => {
    const errors = await validate(plainToInstance(cls, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return errors.map((e) => e.property);
  };

  it('accepts a complete, matching create payload', async () => {
    expect(await errorsFor(CreateAuditorDto, validCreate)).toEqual([]);
  });

  it('requires employee ID, full name and login name', async () => {
    const props = await errorsFor(CreateAuditorDto, {
      ...validCreate,
      employeeId: '',
      fullName: '',
      loginName: '',
    });
    expect(props).toEqual(expect.arrayContaining(['employeeId', 'fullName', 'loginName']));
  });

  it('requires a valid email', async () => {
    expect(await errorsFor(CreateAuditorDto, { ...validCreate, email: 'not-an-email' })).toEqual(['email']);
  });

  it('applies the existing password policy (minimum 8 characters)', async () => {
    const props = await errorsFor(CreateAuditorDto, { ...validCreate, password: 'short', confirmPassword: 'short' });
    expect(props).toEqual(['password']);
  });

  it('rejects a confirm password that does not match', async () => {
    const errors = await validate(
      plainToInstance(CreateAuditorDto, { ...validCreate, confirmPassword: 'Different123!' }),
    );
    expect(errors.map((e) => e.property)).toEqual(['confirmPassword']);
    expect(Object.values(errors[0].constraints ?? {})).toContain('Passwords do not match');
  });

  it('rejects a role field on create (role is always AUDITOR)', async () => {
    expect(await errorsFor(CreateAuditorDto, { ...validCreate, role: 'MANAGER' })).toContain('role');
  });

  it('does not allow loginName or role to be edited', async () => {
    const props = await errorsFor(UpdateAuditorDto, { loginName: 'new.login', role: 'MANAGER' });
    expect(props).toEqual(expect.arrayContaining(['loginName', 'role']));
  });

  it('validates edited email', async () => {
    expect(await errorsFor(UpdateAuditorDto, { email: 'bad' })).toEqual(['email']);
  });
});

describe('Auditor endpoints - route-level RBAC', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const handlers = ['createAuditor', 'listAuditors', 'updateAuditor', 'activate', 'deactivate'] as const;

  const contextFor = (handler: (typeof handlers)[number], user: AuthUser): ExecutionContext =>
    ({
      getHandler: () => UsersController.prototype[handler],
      getClass: () => UsersController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  it('marks the Auditor management endpoints as MANAGER-only', () => {
    for (const handler of ['createAuditor', 'listAuditors', 'updateAuditor'] as const) {
      expect(reflector.get(ROLES_KEY, UsersController.prototype[handler])).toEqual(['MANAGER']);
    }
  });

  it.each(['createAuditor', 'listAuditors', 'updateAuditor'] as const)(
    'lets a Manager through %s',
    (handler) => {
      expect(guard.canActivate(contextFor(handler, manager))).toBe(true);
    },
  );

  it.each([
    ['Team Lead', teamLead],
    ['Coder', coder],
    ['Auditor', auditor],
  ])('blocks a %s from every Manager Auditor-management endpoint', (_label, who) => {
    for (const handler of ['createAuditor', 'listAuditors', 'updateAuditor'] as const) {
      expect(() => guard.canActivate(contextFor(handler, who))).toThrow(ForbiddenException);
    }
  });

  it('blocks a Coder and an Auditor from the generic activate/deactivate endpoints', () => {
    for (const who of [coder, auditor]) {
      expect(() => guard.canActivate(contextFor('activate', who))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(contextFor('deactivate', who))).toThrow(ForbiddenException);
    }
  });
});
