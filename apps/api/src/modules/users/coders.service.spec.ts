import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { CodersService } from './coders.service';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from '../../common/export/export.service';
import { LoginNameAllocationService } from '../login-name-allocations/login-name-allocation.service';

const TEAM = 'team-1';
const teamLead: AuthUser = { id: 'tl-1', employeeId: 'E1', loginName: 'tl.one', email: 'tl@x.local', role: 'TEAM_LEAD', teamId: TEAM, isActive: true };
const teamLeadNoTeam: AuthUser = { ...teamLead, id: 'tl-2', teamId: null };
const manager: AuthUser = { ...teamLead, id: 'm-1', role: 'MANAGER', teamId: null };
const coderRow = {
  id: 'c-1', employeeId: 'EMP100', loginName: 'cody', email: 'cody@x.local', fullName: 'Cody', role: 'CODER',
  isActive: true, teamId: TEAM, passwordHash: 'hash', createdAt: new Date('2026-01-01'), lastLoginAt: null,
};

function csv(text: string, originalname = 'coders.csv') {
  const buffer = Buffer.from(text);
  return { originalname, mimetype: 'text/csv', size: buffer.length, buffer };
}
const HEADER = 'employeeId,fullName,loginName,email,password,confirmPassword,status';

describe('CodersService (Team Lead coder management)', () => {
  let service: CodersService;
  let users: UsersService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      user: { create: jest.fn(async ({ data }) => ({ id: `new-${data.loginName}`, ...data })) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([coderRow]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(coderRow),
        findUnique: jest.fn().mockResolvedValue(coderRow),
        update: jest.fn(async ({ data }) => ({ ...coderRow, ...data })),
        create: jest.fn(async ({ data }) => ({ id: 'c-new', createdAt: new Date(), isActive: true, lastLoginAt: null, ...data })),
      },
      productionEntry: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      vendorAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CodersService,
        UsersService,
        ExportService,
        { provide: PrismaService, useValue: prisma },
        // These CodersService tests only exercise UsersService.createCoder /
        // setActive, never changeLoginName, so a plain never-called stub is
        // enough - Nest still needs the token registered to resolve
        // UsersService's constructor at all (Phase 9 added this dependency).
        { provide: LoginNameAllocationService, useValue: { reallocate: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(CodersService);
    users = moduleRef.get(UsersService);
  });

  describe('list', () => {
    it('only returns CODER users on the caller\'s own team, with search and status filters', async () => {
      const result = await service.list(teamLead, { page: 2, pageSize: 10, search: ' cod ', status: 'inactive' });
      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ role: 'CODER', teamId: TEAM, isActive: false });
      expect(args.where.OR).toHaveLength(4);
      expect(args.where.OR[0]).toEqual({ fullName: { contains: 'cod', mode: 'insensitive' } });
      expect(args.skip).toBe(10);
      expect(result.data[0]).not.toHaveProperty('passwordHash');
      expect(result.data[0]).toMatchObject({ loginName: 'cody', role: 'CODER' });
    });

    it('rejects a Team Lead with no team instead of matching unassigned users', async () => {
      await expect(service.list(teamLeadNoTeam, { page: 1, pageSize: 25, status: 'all' })).rejects.toThrow(ForbiddenException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('rejects non-Team-Lead callers', async () => {
      await expect(service.list(manager, { page: 1, pageSize: 25, status: 'all' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('view / edit', () => {
    it('returns 404 for a Coder on another team (no cross-team probing)', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(service.get(teamLead, 'other')).rejects.toThrow(NotFoundException);
      expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ id: 'other', role: 'CODER', teamId: TEAM });
    });

    it('includes production stats from current versions', async () => {
      prisma.productionEntry.findMany.mockResolvedValueOnce([
        { status: 'COMPLETED', pageCount: 10, totalDOS: 2, totalICDs: 5 },
        { status: 'REWORK', pageCount: 4, totalDOS: 1, totalICDs: 1 },
      ]);
      const detail = await service.get(teamLead, 'c-1');
      expect(detail.stats).toEqual({ charts: 2, completed: 1, inProgress: 0, rework: 1, pages: 14, dos: 3, icds: 6 });
      expect(prisma.productionEntry.findMany.mock.calls[0][0].where).toEqual({ coderId: 'c-1', isCurrent: true });
    });

    it('surfaces the Coder\'s Vendor by name (section 10 profile field), not just vendorId', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ ...coderRow, vendorId: 'v-1', vendor: { id: 'v-1', name: 'Vendor Alpha' } });
      const detail = await service.get(teamLead, 'c-1');
      expect(detail.vendor).toEqual({ id: 'v-1', name: 'Vendor Alpha' });
    });

    it('edits only employee ID, full name and email, rejects duplicates, and logs the change', async () => {
      // No employee ID / email in the body, so only the ownership lookup runs.
      await service.update(teamLead, 'c-1', { fullName: 'Cody R', loginName: 'x', role: 'MANAGER' } as any);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: { fullName: 'Cody R' } });
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('USER_UPDATED');

      prisma.user.findFirst.mockResolvedValueOnce(coderRow).mockResolvedValueOnce({ id: 'someone' });
      await expect(service.update(teamLead, 'c-1', { email: 'taken@x.local' })).rejects.toThrow(ConflictException);
    });
  });

  describe('create (UsersService.createCoder)', () => {
    const dto = { employeeId: 'EMP9', fullName: 'New', loginName: 'new.c', email: 'n@x.local', password: 'Password1!', confirmPassword: 'Password1!' };

    it('creates a Coder on the caller\'s team, never persists confirmPassword, and hashes the password', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      const result = await users.createCoder(teamLead, dto);
      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ role: 'CODER', teamId: TEAM, createdById: teamLead.id });
      expect(data).not.toHaveProperty('confirmPassword');
      expect(data).not.toHaveProperty('password');
      expect(data.passwordHash.startsWith('$argon2')).toBe(true);
      expect(result).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain('Password1!');
    });

    it('can create the account inactive, and logs that', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      const result = await users.createCoder(teamLead, { ...dto, isActive: false });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'c-new' }, data: { isActive: false } });
      expect(result.isActive).toBe(false);
      expect(prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toContain('USER_DEACTIVATED');
    });

    it('rejects a Team Lead without a team', async () => {
      await expect(users.createCoder(teamLeadNoTeam, dto)).rejects.toThrow(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('keeps the hierarchy: a Manager cannot create a Coder', async () => {
      await expect(users.createCoder(manager, dto)).rejects.toThrow(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('setActive (existing endpoint) - team boundary', () => {
    it('lets a Team Lead deactivate their own Coder', async () => {
      await users.setActive(teamLead, 'c-1', false);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: { isActive: false } });
    });

    it('rejects another team\'s Coder', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...coderRow, teamId: 'team-2' });
      await expect(users.setActive(teamLead, 'c-1', false)).rejects.toThrow(ForbiddenException);
    });

    it('does not let a team-less Team Lead manage an unassigned Coder (null must not equal null)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...coderRow, teamId: null });
      await expect(users.setActive(teamLeadNoTeam, 'c-1', false)).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('CSV import', () => {
    const good = (n: number, status = 'Active') => `EMP${n},Coder ${n},coder.${n},coder${n}@x.local,Password1!,Password1!,${status}`;

    it('previews valid, invalid and duplicate rows with row numbers and masks passwords', async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ employeeId: 'EMP3', loginName: 'x', email: 'y' }]);
      const file = csv(
        [
          HEADER,
          good(1),
          'EMP2,,coder.2,not-an-email,short,other,Maybe',
          good(3),
          good(1).replace('coder.1,', 'coder.11,').replace('coder1@', 'coder11@'),
        ].join('\n'),
      );
      const preview = await service.importPreview(teamLead, file);
      expect(preview).toMatchObject({ fileName: 'coders.csv', totalRows: 4, validRows: 1, invalidRows: 1, duplicateRows: 2 });
      const [r1, r2, r3, r4] = preview.rows;
      expect(r1).toMatchObject({ rowNumber: 2, status: 'valid', errors: [] });
      expect(r2.status).toBe('invalid');
      expect(r2.errors.join(' ')).toMatch(/fullName/);
      expect(r2.errors.join(' ')).toMatch(/email/);
      expect(r2.errors.join(' ')).toMatch(/Password must be at least 8 characters/);
      expect(r2.errors.join(' ')).toMatch(/Passwords do not match/);
      expect(r2.errors.join(' ')).toMatch(/status must be "Active" or "Inactive"/);
      expect(r3).toMatchObject({ status: 'duplicate' });
      expect(r3.errors[0]).toMatch(/employeeId "EMP3" already exists/);
      expect(r4.status).toBe('duplicate');
      expect(r4.errors[0]).toMatch(/repeated \(first seen on row 2\)/);
      expect(JSON.stringify(preview)).not.toContain('Password1!');
      expect(r1.data.password).toBe('••••••');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('commits only the valid rows in a single transaction, on the caller\'s team, and logs start/complete', async () => {
      prisma.user.findMany.mockResolvedValueOnce([]);
      const result = await service.importCommit(teamLead, csv([HEADER, good(1), good(2, 'inactive'), 'bad,,,,,,'].join('\n')));
      expect(result).toMatchObject({ imported: 2, skipped: 1 });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.user.create).toHaveBeenCalledTimes(2);
      const [first, second] = tx.user.create.mock.calls.map((c: any) => c[0].data);
      expect(first).toMatchObject({ role: 'CODER', teamId: TEAM, createdById: teamLead.id, isActive: true });
      expect(second.isActive).toBe(false);
      expect(first.passwordHash.startsWith('$argon2')).toBe(true);
      expect(first).not.toHaveProperty('password');
      expect(first).not.toHaveProperty('confirmPassword');
      const actions = [...prisma.auditLog.create.mock.calls, ...tx.auditLog.create.mock.calls].map((c: any) => c[0].data.action);
      expect(actions).toEqual(expect.arrayContaining(['CODER_IMPORT_STARTED', 'USER_CREATED', 'CODER_IMPORT_COMPLETED']));
      const logged = JSON.stringify([prisma.auditLog.create.mock.calls, tx.auditLog.create.mock.calls]);
      expect(logged).not.toContain('Password1!');
      expect(logged).not.toContain('$argon2');
    });

    it('rejects (and logs) an import with no valid rows without opening a transaction', async () => {
      await expect(service.importCommit(teamLead, csv([HEADER, 'x,,,,,,'].join('\n')))).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toContain('CODER_IMPORT_REJECTED');
    });

    it('rolls back everything if a duplicate appears during commit', async () => {
      prisma.user.findMany.mockResolvedValueOnce([]);
      prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(service.importCommit(teamLead, csv([HEADER, good(1)].join('\n')))).rejects.toThrow(ConflictException);
      expect(prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toContain('CODER_IMPORT_REJECTED');
    });

    it('rejects imports from anyone but a Team Lead with a team', async () => {
      await expect(service.importPreview(manager, csv(HEADER))).rejects.toThrow(ForbiddenException);
      await expect(service.importPreview(teamLeadNoTeam, csv(HEADER))).rejects.toThrow(ForbiddenException);
    });
  });

  it('exports only the caller\'s team with the active filters', async () => {
    const file = await service.export(teamLead, 'csv', { search: 'cod', status: 'active' });
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ role: 'CODER', teamId: TEAM, isActive: true });
    expect(file.getHeaders().disposition).toMatch(/smartcode-team-coders-/);
  });
});
