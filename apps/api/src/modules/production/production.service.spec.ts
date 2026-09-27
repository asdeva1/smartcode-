import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { ProductionService } from './production.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from '../../common/export/export.service';

const TEAM = 'team-1';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const coder: AuthUser = { id: 'coder-1', employeeId: 'E1', loginName: 'cody', email: 'c@x.local', role: 'CODER', teamId: TEAM, isActive: true };
const otherCoder: AuthUser = { ...coder, id: 'coder-2' };
const teamLead: AuthUser = { ...coder, id: 'tl-1', role: 'TEAM_LEAD' };
const otherTeamLead: AuthUser = { ...teamLead, id: 'tl-2', teamId: 'team-2' };
const manager: AuthUser = { ...coder, id: 'm-1', role: 'MANAGER', teamId: null };
const auditor: AuthUser = { ...coder, id: 'a-1', role: 'AUDITOR', teamId: null };

const dto = { chartId: 'CH-100', projectId: PROJECT, pageCount: 12, totalICDs: 5, totalDOS: 2, status: 'COMPLETED' as const, codedDate: '2026-01-10' };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-1', chartId: 'CH-100', coderId: coder.id, version: 1, isCurrent: true, pageCount: 12, totalDOS: 2, totalICDs: 5,
    status: 'COMPLETED', remarks: null, codedDate: new Date('2026-01-10'), createdAt: new Date(), updatedAt: new Date(),
    coder: { id: coder.id, fullName: 'Cody', employeeId: 'E1', loginName: 'cody', teamId: TEAM },
    chart: { project: { id: PROJECT, name: 'Proj', teamId: TEAM, client: { id: 'cl', name: 'Client' } } },
    _count: { auditEntries: 0 },
    auditEntries: [],
    ...overrides,
  };
}

describe('ProductionService', () => {
  let service: ProductionService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      chart: { create: jest.fn().mockResolvedValue({}) },
      productionEntry: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(async ({ data }) => row({ ...data, id: 'p-new' })),
      },
      // No Auditor rework linked unless a test says otherwise (see rework.workflow.ts).
      rework: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      chart: { findUnique: jest.fn().mockResolvedValue(null) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: PROJECT, teamId: TEAM, isActive: true }) },
      productionEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(row()),
        findMany: jest.fn().mockResolvedValue([row()]),
        count: jest.fn().mockResolvedValue(1),
        aggregate: jest.fn().mockResolvedValue({ _max: { version: 1 } }),
        update: jest.fn(async ({ data }) => row(data)),
      },
      rework: { findFirst: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ProductionService, ExportService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ProductionService);
  });

  describe('create', () => {
    it('creates the Chart on first submission and version 1 of production, with the coder taken from the session', async () => {
      const result = await service.create(coder, dto);
      expect(tx.chart.create).toHaveBeenCalledWith({ data: { chartId: 'CH-100', projectId: PROJECT } });
      const data = tx.productionEntry.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ chartId: 'CH-100', coderId: coder.id, version: 1, isCurrent: true, pageCount: 12, totalICDs: 5, totalDOS: 2, status: 'COMPLETED' });
      expect(data.codedDate).toEqual(new Date('2026-01-10T00:00:00.000Z'));
      expect(result.coder).toEqual({ id: coder.id, fullName: 'Cody', employeeId: 'E1', loginName: 'cody' });
      expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'PRODUCTION_CREATED', userId: coder.id });
    });

    it.each([
      ['a Team Lead', teamLead],
      ['a Manager', manager],
      ['an Auditor', auditor],
    ])('rejects %s entering production', async (_l, who) => {
      await expect(service.create(who, dto)).rejects.toThrow(ForbiddenException);
    });

    it('requires a project for a new Chart ID, from the coder\'s own team', async () => {
      await expect(service.create(coder, { ...dto, projectId: undefined })).rejects.toThrow('Select the project');
      prisma.project.findUnique.mockResolvedValueOnce({ id: PROJECT, teamId: 'team-2', isActive: true });
      await expect(service.create(coder, dto)).rejects.toThrow(ForbiddenException);
      prisma.project.findUnique.mockResolvedValueOnce({ id: PROJECT, teamId: TEAM, isActive: false });
      await expect(service.create(coder, dto)).rejects.toThrow(NotFoundException);
      expect(tx.productionEntry.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate: the chart already has a current production version', async () => {
      prisma.chart.findUnique.mockResolvedValueOnce({ chartId: 'CH-100', projectId: PROJECT, project: { teamId: TEAM, name: 'Proj' } });
      prisma.productionEntry.findFirst.mockResolvedValueOnce({ id: 'p-1', version: 1, status: 'IN_PROGRESS' });
      await expect(service.create(coder, dto)).rejects.toThrow(ConflictException);
      expect(tx.productionEntry.create).not.toHaveBeenCalled();
    });

    it('rejects a chart whose project belongs to another team', async () => {
      prisma.chart.findUnique.mockResolvedValueOnce({ chartId: 'CH-100', projectId: PROJECT, project: { teamId: 'team-2', name: 'Proj' } });
      await expect(service.create(coder, dto)).rejects.toThrow(ForbiddenException);
    });

    it('re-entering a CANCELLED chart creates the next version and moves "current" to it', async () => {
      prisma.chart.findUnique.mockResolvedValueOnce({ chartId: 'CH-100', projectId: PROJECT, project: { teamId: TEAM, name: 'Proj' } });
      prisma.productionEntry.findFirst.mockResolvedValueOnce({ id: 'p-1', version: 1, status: 'CANCELLED' });
      await service.create(coder, { ...dto, projectId: undefined });
      expect(tx.chart.create).not.toHaveBeenCalled();
      expect(tx.productionEntry.update).toHaveBeenCalledWith({ where: { id: 'p-1' }, data: { isCurrent: false } });
      expect(tx.productionEntry.create.mock.calls[0][0].data).toMatchObject({ version: 2, isCurrent: true });
    });

    it('rejects a coded date in the future and an invalid calendar date', async () => {
      await expect(service.create(coder, { ...dto, codedDate: '2999-01-01' })).rejects.toThrow('cannot be in the future');
      await expect(service.create(coder, { ...dto, codedDate: '2026-02-30' })).rejects.toThrow(BadRequestException);
    });

    it('turns a unique-index race into a 409', async () => {
      prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
      await expect(service.create(coder, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update (status-gated)', () => {
    it('lets the owning coder edit a current IN_PROGRESS version and complete it', async () => {
      prisma.productionEntry.findUnique.mockResolvedValueOnce(row({ status: 'IN_PROGRESS' }));
      await service.update(coder, 'p-1', { pageCount: 13, status: 'COMPLETED' });
      expect(prisma.productionEntry.update.mock.calls[0][0].data).toEqual({ pageCount: 13, status: 'COMPLETED' });
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('PRODUCTION_UPDATED');
    });

    it('never allows editing a COMPLETED record', async () => {
      await expect(service.update(coder, 'p-1', { pageCount: 1 })).rejects.toThrow(/initiate rework/);
      expect(prisma.productionEntry.update).not.toHaveBeenCalled();
    });

    it('enforces the status transition table', async () => {
      prisma.productionEntry.findUnique.mockResolvedValueOnce(row({ status: 'PENDING' }));
      await expect(service.update(coder, 'p-1', { status: 'COMPLETED' })).rejects.toThrow('Cannot change status from PENDING to COMPLETED');
    });

    it('rejects another coder\'s record, superseded versions, and non-coders', async () => {
      await expect(service.update(otherCoder, 'p-1', { pageCount: 1 })).rejects.toThrow(NotFoundException);
      prisma.productionEntry.findUnique.mockResolvedValueOnce(row({ status: 'IN_PROGRESS', isCurrent: false }));
      await expect(service.update(coder, 'p-1', { pageCount: 1 })).rejects.toThrow(/current version/);
      await expect(service.update(auditor, 'p-1', { pageCount: 1 })).rejects.toThrow(ForbiddenException);
      await expect(service.update(teamLead, 'p-1', { pageCount: 1 })).rejects.toThrow(ForbiddenException);
    });

    it('logs REWORK_RESOLVED when a reworked version is completed', async () => {
      prisma.productionEntry.findUnique.mockResolvedValueOnce(row({ status: 'IN_PROGRESS', version: 2 }));
      prisma.productionEntry.update.mockResolvedValueOnce(row({ status: 'COMPLETED', version: 2 }));
      await service.update(coder, 'p-1', { status: 'COMPLETED' });
      expect(prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toEqual(['PRODUCTION_UPDATED', 'REWORK_RESOLVED']);
    });
  });

  describe('rework (versioning)', () => {
    it('creates a new current version pre-filled from the original and leaves the original COMPLETED', async () => {
      const result = await service.rework(coder, 'p-1');
      expect(tx.productionEntry.update).toHaveBeenCalledWith({ where: { id: 'p-1' }, data: { isCurrent: false } });
      const created = tx.productionEntry.create.mock.calls[0][0].data;
      expect(created).toMatchObject({ chartId: 'CH-100', coderId: coder.id, version: 2, isCurrent: true, status: 'REWORK', pageCount: 12, totalICDs: 5, totalDOS: 2 });
      // The original row's status is never touched - only isCurrent flips.
      expect(tx.productionEntry.update.mock.calls[0][0].data).not.toHaveProperty('status');
      expect(result.status).toBe('REWORK');
      expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('REWORK_INITIATED');
    });

    it('allows the team\'s Team Lead and a Manager; hides other teams\' records', async () => {
      await expect(service.rework(teamLead, 'p-1')).resolves.toBeDefined();
      await expect(service.rework(manager, 'p-1')).resolves.toBeDefined();
      await expect(service.rework(otherTeamLead, 'p-1')).rejects.toThrow(NotFoundException);
      await expect(service.rework(otherCoder, 'p-1')).rejects.toThrow(NotFoundException);
    });

    it('never lets an Auditor alter production', async () => {
      await expect(service.rework(auditor, 'p-1')).rejects.toThrow(ForbiddenException);
      expect(tx.productionEntry.create).not.toHaveBeenCalled();
    });

    it('only reworks a current COMPLETED version with no open audit', async () => {
      prisma.productionEntry.findUnique.mockResolvedValueOnce(row({ status: 'IN_PROGRESS' }));
      await expect(service.rework(coder, 'p-1')).rejects.toThrow(ConflictException);
      prisma.productionEntry.findUnique.mockResolvedValueOnce(row({ isCurrent: false }));
      await expect(service.rework(coder, 'p-1')).rejects.toThrow(ConflictException);
      prisma.productionEntry.findUnique.mockResolvedValueOnce(row({ auditEntries: [{ status: 'IN_PROGRESS' }] }));
      await expect(service.rework(coder, 'p-1')).rejects.toThrow(/audit on this version is still open/);
      prisma.productionEntry.findUnique.mockResolvedValueOnce(row({ auditEntries: [{ status: 'REJECTED' }] }));
      await expect(service.rework(coder, 'p-1')).resolves.toBeDefined();
    });
  });

  describe('cancel', () => {
    it('lets a Team Lead cancel an un-audited current version (a status change, not a delete)', async () => {
      await service.cancel(teamLead, 'p-1');
      expect(prisma.productionEntry.update.mock.calls[0][0]).toMatchObject({ where: { id: 'p-1' }, data: { status: 'CANCELLED' } });
    });

    it('rejects audited records, coders and auditors', async () => {
      prisma.productionEntry.findUnique.mockResolvedValueOnce(row({ auditEntries: [{ status: 'COMPLETED' }] }));
      await expect(service.cancel(teamLead, 'p-1')).rejects.toThrow('Audited production cannot be cancelled');
      await expect(service.cancel(coder, 'p-1')).rejects.toThrow(ForbiddenException);
      await expect(service.cancel(auditor, 'p-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list scoping', () => {
    const q = { page: 1, pageSize: 25 };
    it('scopes a coder to their own records even if a coderId filter is supplied', async () => {
      await service.list(coder, { ...q, coderId: otherCoder.id } as any);
      expect(prisma.productionEntry.findMany.mock.calls[0][0].where).toEqual({ AND: [{ coderId: coder.id }, { isCurrent: true }] });
    });

    it('scopes a Team Lead to their team, and filters only narrow that scope', async () => {
      await service.list(teamLead, { ...q, status: 'COMPLETED', search: 'CH', projectId: PROJECT } as any);
      const and = prisma.productionEntry.findMany.mock.calls[0][0].where.AND;
      expect(and[0]).toEqual({ coder: { teamId: TEAM } });
      expect(and).toEqual(expect.arrayContaining([{ status: 'COMPLETED' }, { chart: { projectId: PROJECT } }]));
    });

    it('does not let Auditors list production', async () => {
      await expect(service.list(auditor, q as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Auditor rework linkage', () => {
    it('starting rework on an Auditor-rejected version links the new version and marks the rework IN_PROGRESS', async () => {
      tx.rework.findFirst.mockResolvedValueOnce({ id: 'rw-1', status: 'OPEN' });
      tx.rework.update.mockResolvedValueOnce({ id: 'rw-1' });
      await service.rework(coder, 'p-1');
      expect(tx.rework.findFirst).toHaveBeenCalledWith({ where: { originalProductionId: 'p-1', status: 'OPEN' } });
      expect(tx.rework.update).toHaveBeenCalledWith({ where: { id: 'rw-1' }, data: { reworkProductionId: 'p-new', status: 'IN_PROGRESS' } });
      expect(tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toEqual(['REWORK_INITIATED', 'REWORK_STARTED']);
    });

    it('completing the correction version resolves the rework atomically and notifies Team Lead + Auditor', async () => {
      prisma.productionEntry.findUnique.mockResolvedValueOnce(row({ status: 'IN_PROGRESS', version: 2, id: 'p-2' }));
      prisma.rework.findFirst.mockResolvedValueOnce({ id: 'rw-1', chartId: 'CH-100', status: 'IN_PROGRESS', teamLeadId: 'tl-1', auditorId: 'aud-1' });
      tx.productionEntry.update.mockResolvedValueOnce(row({ status: 'COMPLETED', version: 2, id: 'p-2' }));
      tx.rework.update.mockResolvedValueOnce({});
      tx.notification = { createMany: jest.fn().mockResolvedValue({ count: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
      await service.update(coder, 'p-2', { status: 'COMPLETED' });
      expect(prisma.rework.findFirst).toHaveBeenCalledWith({ where: { reworkProductionId: 'p-2', status: 'IN_PROGRESS' } });
      expect(prisma.productionEntry.update).not.toHaveBeenCalled(); // the transactional path was used
      expect(tx.rework.update.mock.calls[0][0].data).toMatchObject({ status: 'RESOLVED', resolvedById: coder.id });
      expect(tx.notification.createMany.mock.calls.map((c: any) => c[0].data[0].type)).toEqual(['REWORK_RESOLVED', 'REWORK_READY_FOR_REAUDIT']);
      expect(tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toEqual(['PRODUCTION_UPDATED', 'REWORK_RESOLVED', 'REWORK_RESOLVED']);
    });

    it('does not look for a rework unless the edit completes the version', async () => {
      prisma.productionEntry.findUnique.mockResolvedValueOnce(row({ status: 'IN_PROGRESS' }));
      await service.update(coder, 'p-1', { pageCount: 3 });
      expect(prisma.rework.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('vendor scope', () => {
    const inV = { some: { vendorId: 'vendor-a', isActive: true } };
    it('a Vendor account lists only its vendor\'s production (through the coder\'s team)', async () => {
      await service.list({ ...manager, role: 'VENDOR', vendorId: 'vendor-a' }, { page: 1, pageSize: 25 } as any);
      expect(prisma.productionEntry.findMany.mock.calls[0][0].where.AND[0]).toEqual({ coder: { team: { teamLead: { vendorAssignments: inV } } } });
    });

    it('a vendor filter narrows the Manager\'s list and can never widen a Team Lead\'s', async () => {
      await service.list(teamLead, { page: 1, pageSize: 25, vendorId: 'vendor-a' } as any);
      const and = prisma.productionEntry.findMany.mock.calls[0][0].where.AND;
      expect(and[0]).toEqual({ coder: { teamId: TEAM } });
      expect(and).toContainEqual({ coder: { team: { teamLead: { vendorAssignments: inV } } } });
    });

    it('a Vendor account cannot rework, cancel or edit production', async () => {
      const v = { ...manager, role: 'VENDOR' as const, vendorId: 'vendor-a' };
      await expect(service.update(v, 'p-1', { pageCount: 1 })).rejects.toThrow(ForbiddenException);
      await expect(service.cancel(v, 'p-1')).rejects.toThrow(ForbiddenException);
      await expect(service.rework(v, 'p-1')).rejects.toThrow(NotFoundException);
    });
  });
});
