import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { AuthUser } from '@smartcode/types';
import { VendorsService } from './vendors.service';
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto';

const manager: AuthUser = { id: 'm', employeeId: 'E', loginName: 'm', email: 'm@x.local', role: 'MANAGER', teamId: null, isActive: true };
const V = '11111111-1111-4111-8111-111111111111';
const vendorRow = (over: Record<string, unknown> = {}) => ({
  id: V, name: 'Alpha', code: 'ALPHA', contactName: null, contactEmail: null, isActive: true,
  createdAt: new Date(), updatedAt: new Date(), _count: { accounts: 0 }, ...over,
});
const person = (id: string, role: string, over: Record<string, unknown> = {}) => ({
  id, role, fullName: id, employeeId: `E-${id}`, loginName: `${id}.login`, email: `${id}@x.local`, isActive: true, leadsTeam: null, ...over,
});
const inVendor = { some: { vendorId: V, isActive: true } };

describe('VendorsService', () => {
  let prisma: any;
  let users: any;
  let service: VendorsService;

  beforeEach(() => {
    prisma = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue(vendorRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([vendorRow()]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(async ({ data }) => vendorRow(data)),
        update: jest.fn(async ({ data }) => vendorRow(data)),
      },
      vendorAssignment: {
        groupBy: jest.fn().mockResolvedValue([{ vendorId: V, role: 'TEAM_LEAD', _count: { _all: 2 } }]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({ id: 'asg-1', assignedAt: new Date(), ...data })),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(person('tl-1', 'TEAM_LEAD', { leadsTeam: { id: 'team-1', projects: [{ id: 'p-1' }] } })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      team: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      project: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1' }) },
      auditorProjectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      chart: { count: jest.fn().mockResolvedValue(0) },
      productionEntry: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      auditEntry: { count: jest.fn().mockResolvedValue(0) },
      rework: { count: jest.fn().mockResolvedValue(0) },
      auditLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    users = { createWithRole: jest.fn(async (_c, role, dto, extra) => ({ id: 'acc-1', role, ...dto, ...extra, isActive: true })) };
    service = new VendorsService(prisma, users);
  });
  const actions = () => prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action);

  describe('CRUD', () => {
    it('is Manager-only', async () => {
      for (const role of ['TEAM_LEAD', 'AUDITOR', 'CODER', 'VENDOR'] as const) {
        const caller = { ...manager, role };
        await expect(service.list(caller, { page: 1, pageSize: 25, status: 'all' })).rejects.toThrow(ForbiddenException);
        await expect(service.create(caller, { name: 'X', code: 'XX' })).rejects.toThrow(ForbiddenException);
        await expect(service.assign(caller, V, 'TEAM_LEAD', 'tl-1')).rejects.toThrow(ForbiddenException);
      }
    });

    it('creates a vendor (code upper-cased by the DTO), rejects case-insensitive duplicates, and audit-logs', async () => {
      const dto = plainToInstance(CreateVendorDto, { name: ' Alpha ', code: 'alpha-1', contactEmail: 'ops@alpha.test' });
      expect(validateSync(dto)).toEqual([]);
      expect(dto).toMatchObject({ name: 'Alpha', code: 'ALPHA-1' });
      const created = await service.create(manager, dto);
      expect(prisma.vendor.create.mock.calls[0][0].data).toMatchObject({ name: 'Alpha', code: 'ALPHA-1', contactEmail: 'ops@alpha.test', createdById: 'm' });
      expect(created).toMatchObject({ teamLeadCount: 0, auditorCount: 0, accountCount: 0 });
      expect(actions()).toEqual(['VENDOR_CREATED']);
      expect(prisma.vendor.findFirst.mock.calls[0][0].where.OR).toEqual([{ name: { equals: 'Alpha', mode: 'insensitive' } }, { code: { equals: 'ALPHA-1', mode: 'insensitive' } }]);

      prisma.vendor.findFirst.mockResolvedValueOnce({ id: 'other' });
      await expect(service.create(manager, dto)).rejects.toThrow(ConflictException);
      prisma.vendor.create.mockRejectedValueOnce(Object.assign(new Error(), { code: 'P2002' }));
      await expect(service.create(manager, dto)).rejects.toThrow(ConflictException);
    });

    it('validates vendor input (name length, code pattern, email)', () => {
      const bad = plainToInstance(CreateVendorDto, { name: 'A', code: 'a b', contactEmail: 'nope' });
      expect(validateSync(bad).map((e) => e.property).sort()).toEqual(['code', 'contactEmail', 'name']);
      // the permanent code is not an editable field
      const upd = plainToInstance(UpdateVendorDto, { name: 'Alpha 2', code: 'NEW' });
      expect(validateSync(upd, { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property)).toEqual(['code']);
    });

    it('edits with before/after audit log and a name uniqueness check that excludes itself', async () => {
      await service.update(manager, V, { name: 'Alpha Two', contactName: '' });
      expect(prisma.vendor.findFirst.mock.calls[0][0].where).toMatchObject({ id: { not: V } });
      expect(prisma.vendor.update.mock.calls[0][0].data).toEqual({ name: 'Alpha Two', contactName: null });
      const log = prisma.auditLog.create.mock.calls[0][0].data;
      expect(log).toMatchObject({ action: 'VENDOR_UPDATED', entity: 'Vendor', entityId: V, before: { name: 'Alpha' }, after: { name: 'Alpha Two' } });
      prisma.vendor.findUnique.mockResolvedValueOnce(null);
      await expect(service.update(manager, V, { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('activates / deactivates with an audit log, and refuses a no-op', async () => {
      await service.setActive(manager, V, false);
      expect(prisma.vendor.update.mock.calls[0][0].data).toEqual({ isActive: false });
      prisma.vendor.findUnique.mockResolvedValueOnce(vendorRow({ isActive: false }));
      await service.setActive(manager, V, true);
      expect(actions()).toEqual(['VENDOR_DEACTIVATED', 'VENDOR_ACTIVATED']);
      await expect(service.setActive(manager, V, true)).rejects.toThrow('already active');
    });

    it('searches and filters by status with pagination and per-vendor member counts', async () => {
      const r = await service.list(manager, { page: 2, pageSize: 10, status: 'inactive', search: ' alp ' });
      const args = prisma.vendor.findMany.mock.calls[0][0];
      expect(args.where.isActive).toBe(false);
      expect(args.where.OR[0]).toEqual({ name: { contains: 'alp', mode: 'insensitive' } });
      expect([args.skip, args.take]).toEqual([10, 10]);
      expect(r.data[0]).toMatchObject({ teamLeadCount: 2, auditorCount: 0 });
    });
  });

  describe('assignments', () => {
    it('assigns a Team Lead after validating vendor, user, duplicates and cross-vendor Auditors; logs it', async () => {
      const r = await service.assign(manager, V, 'TEAM_LEAD', 'tl-1');
      expect(prisma.vendorAssignment.create.mock.calls[0][0].data).toEqual({ vendorId: V, userId: 'tl-1', role: 'TEAM_LEAD', assignedById: 'm' });
      expect(prisma.auditorProjectAssignment.findMany.mock.calls[0][0].where).toEqual({ projectId: { in: ['p-1'] } });
      expect(r).toMatchObject({ assignmentId: 'asg-1', vendorId: V });
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'VENDOR_TEAM_LEAD_ASSIGNED', entity: 'Vendor', entityId: V, after: { userId: 'tl-1', role: 'TEAM_LEAD' } });
    });

    it('validates vendor existence/active, user existence/role/active', async () => {
      prisma.vendor.findUnique.mockResolvedValueOnce(null);
      await expect(service.assign(manager, V, 'TEAM_LEAD', 'tl-1')).rejects.toThrow('Vendor not found');
      prisma.vendor.findUnique.mockResolvedValueOnce(vendorRow({ isActive: false }));
      await expect(service.assign(manager, V, 'TEAM_LEAD', 'tl-1')).rejects.toThrow(/inactive/);
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.assign(manager, V, 'TEAM_LEAD', 'x')).rejects.toThrow('Team Lead not found');
      prisma.user.findUnique.mockResolvedValueOnce(person('c-1', 'CODER'));
      await expect(service.assign(manager, V, 'AUDITOR', 'c-1')).rejects.toThrow('Auditor not found');
      prisma.user.findUnique.mockResolvedValueOnce(person('tl-1', 'TEAM_LEAD', { isActive: false }));
      await expect(service.assign(manager, V, 'TEAM_LEAD', 'tl-1')).rejects.toThrow(/inactive/);
      expect(prisma.vendorAssignment.create).not.toHaveBeenCalled();
    });

    it('prevents duplicate and cross-vendor assignment (one active vendor per person)', async () => {
      prisma.vendorAssignment.findFirst.mockResolvedValueOnce({ vendorId: V, vendor: { id: V, name: 'Alpha' } });
      await expect(service.assign(manager, V, 'TEAM_LEAD', 'tl-1')).rejects.toThrow('already assigned to this vendor');
      prisma.vendorAssignment.findFirst.mockResolvedValueOnce({ vendorId: 'other', vendor: { id: 'other', name: 'Beta' } });
      await expect(service.assign(manager, V, 'TEAM_LEAD', 'tl-1')).rejects.toThrow('already assigned to vendor "Beta"');
      // race with the partial unique index
      prisma.vendorAssignment.create.mockRejectedValueOnce(Object.assign(new Error(), { code: 'P2002' }));
      await expect(service.assign(manager, V, 'TEAM_LEAD', 'tl-1')).rejects.toThrow(ConflictException);
    });

    it('refuses a Team Lead whose team projects hold another vendor\'s Auditor', async () => {
      prisma.auditorProjectAssignment.findMany.mockResolvedValueOnce([
        { project: { name: 'Cardio' }, auditor: { fullName: 'Ben', loginName: 'ben', vendorAssignments: [{ vendorId: 'other' }] } },
      ]);
      await expect(service.assign(manager, V, 'TEAM_LEAD', 'tl-1')).rejects.toThrow(/Ben on Cardio/);
      expect(prisma.vendorAssignment.create).not.toHaveBeenCalled();
    });

    it('refuses an Auditor already assigned to projects outside the vendor', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(person('aud-1', 'AUDITOR'));
      prisma.auditorProjectAssignment.findMany.mockResolvedValueOnce([{ project: { id: 'p-9', name: 'Ortho' } }]);
      prisma.vendorAssignment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ vendorId: 'other' }); // auditor: none; project TL: other vendor
      await expect(service.assign(manager, V, 'AUDITOR', 'aud-1')).rejects.toThrow(/outside this vendor \(Ortho\)/);
    });

    it('removes an assignment as history (not a delete) and audit-logs it', async () => {
      prisma.vendorAssignment.findFirst.mockResolvedValueOnce({ id: 'asg-1', vendorId: V, userId: 'aud-1', role: 'AUDITOR', assignedAt: new Date('2026-09-01') });
      await service.unassign(manager, V, 'AUDITOR', 'aud-1');
      const upd = prisma.vendorAssignment.update.mock.calls[0][0];
      expect(upd.where).toEqual({ id: 'asg-1' });
      expect(upd.data).toMatchObject({ isActive: false, removedById: 'm' });
      expect(upd.data.removedAt).toBeInstanceOf(Date);
      expect(actions()).toEqual(['VENDOR_AUDITOR_REMOVED']);
      await expect(service.unassign(manager, V, 'AUDITOR', 'nobody')).rejects.toThrow(NotFoundException);
    });

    it('lists only active, unassigned candidates', async () => {
      await service.assignable(manager, V, 'AUDITOR');
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ role: 'AUDITOR', isActive: true, vendorAssignments: { none: { isActive: true } } });
    });

    it('creates Vendor login accounts through the shared user-creation path', async () => {
      await service.createAccount(manager, V, { employeeId: 'E9', fullName: 'Ops', loginName: 'ops', email: 'o@x.local', password: 'Password1', confirmPassword: 'Password1' });
      expect(users.createWithRole).toHaveBeenCalledWith(manager, 'VENDOR', { employeeId: 'E9', fullName: 'Ops', loginName: 'ops', email: 'o@x.local', password: 'Password1' }, { vendorId: V });
      expect(actions()).toEqual(['VENDOR_ACCOUNT_CREATED']);
      prisma.vendor.findUnique.mockResolvedValueOnce(vendorRow({ isActive: false }));
      await expect(service.createAccount(manager, V, {} as any)).rejects.toThrow(/inactive/);
    });
  });

  describe('scoped reads', () => {
    it('computes every dashboard figure inside the vendor scope only', async () => {
      const d = await service.dashboard(V, '2026-09-27');
      expect(d).toMatchObject({ role: 'VENDOR', vendor: { id: V }, period: { from: '2026-09-01', to: '2026-09-27' } });
      expect(d.metrics.map((m) => m.key)).toEqual(expect.arrayContaining(['teams', 'teamLeads', 'coders', 'auditors', 'productionCompleted', 'auditsCompleted', 'pendingRework', 'monthCharts']));
      for (const [args] of prisma.productionEntry.count.mock.calls) expect(args.where.AND[0]).toEqual({ coder: { team: { teamLead: { vendorAssignments: inVendor } } } });
      for (const [args] of prisma.auditEntry.count.mock.calls) expect(args.where.AND[0]).toEqual({ productionEntry: { chart: { project: { team: { teamLead: { vendorAssignments: inVendor } } } } } });
      for (const [args] of prisma.rework.count.mock.calls) expect(args.where.AND[0]).toEqual({ project: { team: { teamLead: { vendorAssignments: inVendor } } } });
      expect(prisma.team.count.mock.calls[0][0].where).toEqual({ teamLead: { vendorAssignments: inVendor } });
    });

    it('activity covers vendor admin events and the vendor\'s own people only', async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'tl-1' }, { id: 'c-1' }]);
      await service.activity(V, 1, 25);
      expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({ OR: [{ entity: 'Vendor', entityId: V }, { userId: { in: ['tl-1', 'c-1'] } }] });
    });
  });
});
