import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { AuditsService } from './audits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from '../../common/export/export.service';

const PROJECT = 'proj-1';
const auditor: AuthUser = { id: 'aud-1', employeeId: 'A1', loginName: 'alex', email: 'a@x.local', role: 'AUDITOR', teamId: null, isActive: true };
const otherAuditor: AuthUser = { ...auditor, id: 'aud-2' };
const teamLead: AuthUser = { ...auditor, id: 'tl-1', role: 'TEAM_LEAD', teamId: 'team-1' };
const otherTeamLead: AuthUser = { ...teamLead, id: 'tl-2', teamId: 'team-2' };
const manager: AuthUser = { ...auditor, id: 'm-1', role: 'MANAGER' };
const coder: AuthUser = { ...auditor, id: 'c-1', role: 'CODER', teamId: 'team-1' };

const chart = { chartId: 'CH-1', projectId: PROJECT, project: { id: PROJECT, name: 'Proj', teamId: 'team-1', client: { id: 'cl', name: 'Client' } } };
const person = (id: string) => ({ id, fullName: id, employeeId: `E-${id}`, loginName: `${id}.login` });

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'au-1', chartId: 'CH-1', productionEntryId: 'p-1', auditorId: auditor.id, auditErrors: 2, errorExceptions: 1, totalErrors: 3,
    status: 'IN_PROGRESS', auditDate: new Date('2026-01-12'), remarks: null, createdAt: new Date(), updatedAt: new Date(),
    auditor: person(auditor.id),
    productionEntry: { id: 'p-1', version: 1, isCurrent: true, status: 'COMPLETED', coder: person('coder-1'), chart: { project: chart.project } },
    ...overrides,
  };
}

const createDto = { chartId: 'CH-1', auditErrors: 4, errorExceptions: 2, status: 'COMPLETED' as const, auditDate: '2026-01-12' };

describe('AuditsService', () => {
  let service: AuditsService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      auditEntry: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue({ id: 'au-1' }),
        create: jest.fn(async ({ data }) => auditRow({ ...data, id: 'au-new' })),
        update: jest.fn(async ({ data }) => auditRow(data)),
      },
      // Rework bookkeeping that runs inside the audit transaction (see rework.workflow.ts).
      productionEntry: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p-1', version: 1, coderId: 'coder-1', coder: { teamId: 'team-1' },
          chart: { projectId: PROJECT, project: { teamId: 'team-1', team: { teamLeadId: 'tl-1' } } },
        }),
      },
      rework: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({ id: 'rw-new', ...data })),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
      notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      chart: { findUnique: jest.fn().mockResolvedValue(chart) },
      auditorProjectAssignment: { findUnique: jest.fn(async ({ where }) => (where.auditorId_projectId.auditorId === auditor.id ? { id: 'asg' } : null)) },
      productionEntry: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p-1', version: 1, status: 'COMPLETED', auditEntries: [], coder: person('coder-1'), pageCount: 10, totalDOS: 2, totalICDs: 4, codedDate: new Date('2026-01-10') }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        create: jest.fn(),
      },
      auditEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(auditRow()),
        findFirst: jest.fn().mockResolvedValue(auditRow()),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(async ({ data }) => auditRow(data)),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [AuditsService, ExportService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AuditsService);
  });

  const noProductionWrites = () => {
    expect(prisma.productionEntry.update).not.toHaveBeenCalled();
    expect(prisma.productionEntry.create).not.toHaveBeenCalled();
  };

  describe('create', () => {
    it('links to the current production version, takes the auditor from the session, and computes Total Errors server-side', async () => {
      const result = await service.create(auditor, createDto);
      const data = tx.auditEntry.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ productionEntryId: 'p-1', chartId: 'CH-1', auditorId: auditor.id, auditErrors: 4, errorExceptions: 2, totalErrors: 6, status: 'COMPLETED' });
      expect(result.totalErrors).toBe(6);
      expect(tx.$queryRaw).toHaveBeenCalled(); // row lock, not an update
      expect(tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toEqual(['AUDIT_CREATED', 'AUDIT_COMPLETED']);
      noProductionWrites();
    });

    it('never stores production data on the audit (no copy of pages/DOS/ICDs/coder)', async () => {
      await service.create(auditor, createDto);
      const data = tx.auditEntry.create.mock.calls[0][0].data;
      for (const field of ['pageCount', 'totalDOS', 'totalICDs', 'coderId', 'codedDate']) expect(data).not.toHaveProperty(field);
    });

    it('rejects a client-supplied totalErrors that does not match', async () => {
      await expect(service.create(auditor, { ...createDto, totalErrors: 99 })).rejects.toThrow(BadRequestException);
      await expect(service.create(auditor, { ...createDto, totalErrors: 6 })).resolves.toBeDefined();
    });

    it('404s for a chart outside the auditor\'s assigned projects (or unknown)', async () => {
      await expect(service.create(otherAuditor, createDto)).rejects.toThrow(NotFoundException);
      prisma.chart.findUnique.mockResolvedValueOnce(null);
      await expect(service.create(auditor, createDto)).rejects.toThrow(NotFoundException);
      expect(tx.auditEntry.create).not.toHaveBeenCalled();
    });

    it('only audits COMPLETED production', async () => {
      prisma.productionEntry.findFirst.mockResolvedValueOnce({ id: 'p-1', version: 2, status: 'REWORK', auditEntries: [] });
      await expect(service.create(auditor, createDto)).rejects.toThrow(/only COMPLETED production can be audited/);
    });

    it('prevents a second audit on the same version (409) and points to re-audit when the first was REJECTED', async () => {
      prisma.productionEntry.findFirst.mockResolvedValueOnce({ id: 'p-1', version: 1, status: 'COMPLETED', auditEntries: [{ id: 'x', status: 'COMPLETED' }] });
      await expect(service.create(auditor, createDto)).rejects.toThrow(ConflictException);
      prisma.productionEntry.findFirst.mockResolvedValueOnce({ id: 'p-1', version: 1, status: 'COMPLETED', auditEntries: [{ id: 'x', status: 'REJECTED' }] });
      await expect(service.create(auditor, createDto)).rejects.toThrow(/use re-audit/);
    });

    it('re-checks inside the transaction so concurrent auditors cannot both create the first audit', async () => {
      tx.auditEntry.count.mockResolvedValueOnce(1);
      await expect(service.create(auditor, createDto)).rejects.toThrow(/audited by someone else/);
      expect(tx.auditEntry.create).not.toHaveBeenCalled();
    });

    it('only Auditors create audits (Coders can never touch audit records)', async () => {
      for (const who of [coder, teamLead, manager]) await expect(service.create(who, createDto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a future audit date', async () => {
      await expect(service.create(auditor, { ...createDto, auditDate: '2999-01-01' })).rejects.toThrow(/future/);
    });
  });

  describe('update', () => {
    it('recomputes Total Errors from the merged values', async () => {
      await service.update(auditor, 'au-1', { auditErrors: 5 });
      expect(prisma.auditEntry.update.mock.calls[0][0].data).toMatchObject({ auditErrors: 5, errorExceptions: 1, totalErrors: 6 });
      noProductionWrites();
    });

    it('keeps COMPLETED audits immutable', async () => {
      prisma.auditEntry.findUnique.mockResolvedValueOnce(auditRow({ status: 'COMPLETED' }));
      await expect(service.update(auditor, 'au-1', { auditErrors: 0 })).rejects.toThrow(/immutable/);
    });

    it('enforces audit status transitions', async () => {
      prisma.auditEntry.findUnique.mockResolvedValueOnce(auditRow({ status: 'PENDING' }));
      await expect(service.update(auditor, 'au-1', { status: 'COMPLETED' })).rejects.toThrow('Cannot change audit status from PENDING to COMPLETED');
    });

    it('only the owning Auditor can edit; Coders are refused', async () => {
      await expect(service.update(otherAuditor, 'au-1', { auditErrors: 1 })).rejects.toThrow(NotFoundException);
      await expect(service.update(coder, 'au-1', { auditErrors: 1 })).rejects.toThrow(ForbiddenException);
    });

    it('logs the status-specific event when an audit is completed', async () => {
      prisma.auditEntry.update.mockResolvedValueOnce(auditRow({ status: 'COMPLETED' }));
      await service.update(auditor, 'au-1', { status: 'COMPLETED' });
      expect(prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toEqual(['AUDIT_UPDATED', 'AUDIT_COMPLETED']);
    });
  });

  describe('resolve (REVIEW_REQUIRED)', () => {
    beforeEach(() => prisma.auditEntry.findUnique.mockResolvedValue(auditRow({ status: 'REVIEW_REQUIRED' })));

    it('lets the chart\'s Team Lead or a Manager resolve to COMPLETED or REJECTED', async () => {
      // Rejecting on review sends the chart to rework, so it commits in one transaction with the rework.
      await service.resolve(teamLead, 'au-1', { status: 'REJECTED', remarks: 'recode' });
      expect(tx.auditEntry.update.mock.calls[0][0].data).toEqual({ status: 'REJECTED', remarks: 'recode' });
      expect(tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toEqual(['AUDIT_RESOLVED', 'REWORK_CREATED']);
      await service.resolve(manager, 'au-1', { status: 'COMPLETED' });
      expect(prisma.auditEntry.update.mock.calls[0][0].data).toEqual({ status: 'COMPLETED' });
      expect(prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toEqual(['AUDIT_RESOLVED']);
    });

    it('hides other teams\' audits and refuses Auditors/Coders', async () => {
      await expect(service.resolve(otherTeamLead, 'au-1', { status: 'COMPLETED' })).rejects.toThrow(NotFoundException);
      await expect(service.resolve(auditor, 'au-1', { status: 'COMPLETED' })).rejects.toThrow(ForbiddenException);
      await expect(service.resolve(coder, 'au-1', { status: 'COMPLETED' })).rejects.toThrow(ForbiddenException);
    });

    it('only resolves REVIEW_REQUIRED audits', async () => {
      prisma.auditEntry.findUnique.mockResolvedValueOnce(auditRow({ status: 'COMPLETED' }));
      await expect(service.resolve(manager, 'au-1', { status: 'REJECTED' })).rejects.toThrow(ConflictException);
    });
  });

  describe('re-audit', () => {
    const reaudit = { auditErrors: 1, errorExceptions: 0, status: 'COMPLETED' as const, auditDate: '2026-01-15' };
    beforeEach(() => prisma.auditEntry.findUnique.mockResolvedValue(auditRow({ status: 'REJECTED' })));

    it('always creates a NEW audit row against the same version; the rejected audit is never modified', async () => {
      const result = await service.reaudit(auditor, 'au-1', reaudit);
      expect(tx.auditEntry.create.mock.calls[0][0].data).toMatchObject({ productionEntryId: 'p-1', chartId: 'CH-1', auditorId: auditor.id, totalErrors: 1, status: 'COMPLETED' });
      expect(prisma.auditEntry.update).not.toHaveBeenCalled();
      expect(result.id).toBe('au-new');
      expect(tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toEqual(['REAUDIT_CREATED', 'REAUDIT_COMPLETED']);
      noProductionWrites();
    });

    it('requires the target to be REJECTED and still the latest audit', async () => {
      prisma.auditEntry.findUnique.mockResolvedValueOnce(auditRow({ status: 'COMPLETED' }));
      await expect(service.reaudit(auditor, 'au-1', reaudit)).rejects.toThrow('Only a REJECTED audit can be re-audited');
      tx.auditEntry.findFirst.mockResolvedValueOnce({ id: 'newer' });
      await expect(service.reaudit(auditor, 'au-1', reaudit)).rejects.toThrow('A newer audit already exists');
    });

    it('sends the auditor to the new version after rework instead of re-auditing the old one', async () => {
      prisma.auditEntry.findUnique.mockResolvedValueOnce(
        auditRow({ status: 'REJECTED', productionEntry: { id: 'p-1', version: 1, isCurrent: false, status: 'COMPLETED' } }),
      );
      await expect(service.reaudit(auditor, 'au-1', reaudit)).rejects.toThrow(/was reworked/);
    });

    it('refuses Coders and Team Leads, and unassigned Auditors', async () => {
      await expect(service.reaudit(coder, 'au-1', reaudit)).rejects.toThrow(ForbiddenException);
      await expect(service.reaudit(teamLead, 'au-1', reaudit)).rejects.toThrow(ForbiddenException);
      await expect(service.reaudit(otherAuditor, 'au-1', reaudit)).rejects.toThrow(NotFoundException);
    });
  });

  describe('lookup (Auditor enters Chart ID)', () => {
    it('returns read-only production with coder identity and whether a new audit is possible', async () => {
      const result = await service.lookup(auditor, 'CH-1');
      expect(result.production).toEqual({
        id: 'p-1', version: 1, pageCount: 10, totalDOS: 2, totalICDs: 4, codedDate: '2026-01-10', status: 'COMPLETED',
        coder: person('coder-1'),
      });
      expect(result).toMatchObject({ canAudit: true, reason: null, openAuditId: null, reauditTargetId: null });
      noProductionWrites();
    });

    it('offers the caller\'s open audit and the re-audit target when applicable', async () => {
      prisma.auditEntry.findMany.mockResolvedValueOnce([auditRow({ id: 'mine', status: 'IN_PROGRESS' })]);
      expect((await service.lookup(auditor, 'CH-1')).openAuditId).toBe('mine');
      prisma.auditEntry.findMany.mockResolvedValueOnce([auditRow({ id: 'rej', status: 'REJECTED' })]);
      expect((await service.lookup(auditor, 'CH-1')).reauditTargetId).toBe('rej');
    });

    it('404s outside assigned projects', async () => {
      await expect(service.lookup(otherAuditor, 'CH-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('queue', () => {
    it('is limited to the caller\'s assigned projects and current COMPLETED production', async () => {
      await service.queue(auditor, { page: 1, pageSize: 25, state: 'pending' });
      const where = prisma.productionEntry.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        isCurrent: true,
        status: 'COMPLETED',
        chart: { project: { auditorAssignments: { some: { auditorId: auditor.id } } } },
        auditEntries: { none: {} },
      });
    });

    it('is Auditor-only', async () => {
      await expect(service.queue(teamLead, { page: 1, pageSize: 25, state: 'all' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list scoping', () => {
    it('Auditor sees own audits; Team Lead sees own team charts; filters only narrow', async () => {
      await service.list(auditor, { page: 1, pageSize: 25, projectId: 'x' } as any);
      expect(prisma.auditEntry.findMany.mock.calls[0][0].where.AND[0]).toEqual({ auditorId: auditor.id });
      await service.list(teamLead, { page: 1, pageSize: 25, projectId: 'x' } as any);
      const and = prisma.auditEntry.findMany.mock.calls[1][0].where.AND;
      expect(and[0]).toEqual({ productionEntry: { chart: { project: { teamId: 'team-1' } } } });
      expect(and).toContainEqual({ productionEntry: { chart: { projectId: 'x' } } });
    });

    it('Coders have no audit list access', async () => {
      await expect(service.list(coder, { page: 1, pageSize: 25 } as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('CSV import', () => {
    const csv = (text: string) => ({ originalname: 'audits.csv', mimetype: 'text/csv', size: text.length, buffer: Buffer.from(text) });
    const HEADER = 'chartId,auditErrors,errorExceptions,status,auditDate,remarks';

    it('previews valid / invalid / duplicate rows without writing', async () => {
      prisma.chart.findUnique.mockImplementation(async ({ where }: any) => (where.chartId === 'UNKNOWN' ? null : { ...chart, chartId: where.chartId }));
      prisma.productionEntry.findFirst.mockImplementation(async ({ where }: any) =>
        where.chartId === 'DONE'
          ? { id: 'p-9', version: 1, status: 'COMPLETED', auditEntries: [{ id: 'z', status: 'COMPLETED' }] }
          : { id: `p-${where.chartId}`, version: 1, status: 'COMPLETED', auditEntries: [] },
      );
      const preview = await service.importPreview(
        auditor,
        csv([HEADER, 'CH-1,2,1,Completed,2026-01-10,ok', 'CH-2,-1,x,maybe,2026-13-01,', 'CH-1,0,0,COMPLETED,2026-01-10,', 'UNKNOWN,1,1,COMPLETED,2026-01-10,', 'DONE,1,1,COMPLETED,2026-01-10,'].join('\n')),
      );
      expect(preview).toMatchObject({ totalRows: 5, validRows: 1, invalidRows: 2, duplicateRows: 2 });
      expect(preview.rows[1].errors.join(' ')).toMatch(/auditErrors.*negative/);
      expect(preview.rows[1].errors.join(' ')).toMatch(/errorExceptions/);
      expect(preview.rows[1].errors.join(' ')).toMatch(/status/);
      expect(preview.rows[2].errors[0]).toMatch(/repeated/);
      expect(preview.rows[3].errors[0]).toMatch(/not found in your assigned projects/);
      expect(preview.rows[4].errors[0]).toMatch(/already has an audit/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('commits valid rows in one transaction with server-computed totals, and never touches production', async () => {
      const result = await service.importCommit(auditor, csv([HEADER, 'CH-1,2,1,COMPLETED,2026-01-10,', 'bad,x,,,,'].join('\n')));
      expect(result).toMatchObject({ imported: 1, skipped: 1 });
      expect(tx.auditEntry.create.mock.calls[0][0].data).toMatchObject({ chartId: 'CH-1', auditorId: auditor.id, totalErrors: 3 });
      const actions = [...prisma.auditLog.create.mock.calls, ...tx.auditLog.create.mock.calls].map((c: any) => c[0].data.action);
      expect(actions).toEqual(expect.arrayContaining(['AUDIT_IMPORT_STARTED', 'AUDIT_CREATED', 'AUDIT_IMPORT_COMPLETED']));
      noProductionWrites();
    });

    it('rolls back the whole import if a chart is audited concurrently', async () => {
      tx.auditEntry.count.mockResolvedValueOnce(1);
      await expect(service.importCommit(auditor, csv([HEADER, 'CH-1,2,1,COMPLETED,2026-01-10,'].join('\n')))).rejects.toThrow(ConflictException);
      expect(prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toContain('AUDIT_IMPORT_REJECTED');
    });

    it('is Auditor-only (no production import path exists)', async () => {
      await expect(service.importPreview(coder, csv(HEADER))).rejects.toThrow(ForbiddenException);
      await expect(service.importPreview(teamLead, csv(HEADER))).rejects.toThrow(ForbiddenException);
    });
  });

  describe('rework decisions ("Rework" = REJECTED)', () => {
    const csv = (text: string) => ({ originalname: 'audits.csv', mimetype: 'text/csv', size: text.length, buffer: Buffer.from(text) });

    it('requires a rework reason in Remarks and writes nothing without one', async () => {
      await expect(service.create(auditor, { ...createDto, status: 'REJECTED' })).rejects.toThrow(/rework reason is required/);
      await expect(service.create(auditor, { ...createDto, status: 'REJECTED', remarks: '  x ' })).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('opens the rework in the same transaction as the audit and notifies Coder + Team Lead', async () => {
      await service.create(auditor, { ...createDto, status: 'REJECTED', remarks: 'ICD missing for DOS 2' });
      expect(tx.rework.create.mock.calls[0][0].data).toMatchObject({
        chartId: 'CH-1', auditEntryId: 'au-new', originalProductionId: 'p-1', coderId: 'coder-1', auditorId: auditor.id,
        teamId: 'team-1', teamLeadId: 'tl-1', projectId: PROJECT, reason: 'ICD missing for DOS 2', status: 'OPEN',
      });
      expect(tx.notification.createMany.mock.calls[0][0].data.map((n: any) => n.userId)).toEqual(['coder-1', 'tl-1']);
      expect(tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toEqual(['AUDIT_CREATED', 'AUDIT_REJECTED', 'REWORK_CREATED']);
      noProductionWrites();
    });

    it('a normal audit opens nothing; the first audit on a corrected version marks its rework REAUDITED', async () => {
      await service.create(auditor, createDto);
      expect(tx.rework.create).not.toHaveBeenCalled();
      tx.rework.findFirst.mockResolvedValueOnce({ id: 'rw-1', status: 'RESOLVED' });
      await service.create(auditor, createDto);
      expect(tx.rework.findFirst).toHaveBeenLastCalledWith({ where: { reworkProductionId: 'p-1', status: 'RESOLVED' } });
      expect(tx.rework.update.mock.calls[0][0]).toMatchObject({ where: { id: 'rw-1' }, data: { status: 'REAUDITED', reauditEntryId: 'au-new' } });
    });

    it('editing an open audit to REJECTED is transactional with its rework (reason from the edit or the existing remarks)', async () => {
      await expect(service.update(auditor, 'au-1', { status: 'REJECTED' })).rejects.toThrow(/rework reason is required/);
      prisma.auditEntry.findUnique.mockResolvedValueOnce(auditRow({ remarks: 'DOS count wrong' }));
      await service.update(auditor, 'au-1', { status: 'REJECTED' });
      expect(prisma.auditEntry.update).not.toHaveBeenCalled();
      expect(tx.auditEntry.update.mock.calls[0][0].data).toMatchObject({ status: 'REJECTED' });
      expect(tx.rework.create.mock.calls[0][0].data.reason).toBe('DOS count wrong');
    });

    it('re-audit: rejecting again replaces the rework; accepting withdraws it', async () => {
      prisma.auditEntry.findUnique.mockResolvedValue(auditRow({ status: 'REJECTED' }));
      const base = { auditErrors: 1, errorExceptions: 0, auditDate: '2026-01-15' };
      await expect(service.reaudit(auditor, 'au-1', { ...base, status: 'REJECTED' })).rejects.toThrow(/rework reason is required/);
      await service.reaudit(auditor, 'au-1', { ...base, status: 'REJECTED', remarks: 'Still missing' });
      expect(tx.rework.create.mock.calls[0][0].data).toMatchObject({ auditEntryId: 'au-new', reason: 'Still missing' });
      tx.rework.findUnique.mockResolvedValueOnce({ id: 'rw-old', status: 'OPEN', chartId: 'CH-1', coderId: 'coder-1', teamLeadId: 'tl-1' });
      await service.reaudit(auditor, 'au-1', { ...base, status: 'COMPLETED' });
      expect(tx.rework.findUnique).toHaveBeenLastCalledWith({ where: { auditEntryId: 'au-1' } });
      expect(tx.rework.update).toHaveBeenLastCalledWith({ where: { id: 'rw-old' }, data: { status: 'WITHDRAWN' } });
    });

    it('a Team Lead rejecting a review opens a rework too, using the review remarks as the reason', async () => {
      prisma.auditEntry.findUnique.mockResolvedValue(auditRow({ status: 'REVIEW_REQUIRED', remarks: null }));
      await expect(service.resolve(teamLead, 'au-1', { status: 'REJECTED' })).rejects.toThrow(/rework reason is required/);
      await service.resolve(teamLead, 'au-1', { status: 'REJECTED', remarks: 'Coder must recode' });
      expect(tx.rework.create.mock.calls[0][0].data.reason).toBe('Coder must recode');
    });

    it('CSV import: a REJECTED row needs a reason; valid REJECTED rows open reworks', async () => {
      const HEADER = 'chartId,auditErrors,errorExceptions,status,auditDate,remarks';
      const preview = await service.importPreview(auditor, csv([HEADER, 'CH-1,1,0,REJECTED,2026-01-10,'].join('\n')));
      expect(preview.rows[0]).toMatchObject({ status: 'invalid' });
      expect(preview.rows[0].errors.join(' ')).toMatch(/rework reason is required/);
      await service.importCommit(auditor, csv([HEADER, 'CH-1,1,0,REJECTED,2026-01-10,Wrong DOS'].join('\n')));
      expect(tx.rework.create.mock.calls[0][0].data.reason).toBe('Wrong DOS');
    });
  });

  describe('vendor scope', () => {
    it('a vendor Auditor cannot reach a chart outside their vendor even with an old project assignment (404)', async () => {
      prisma.project = { count: jest.fn().mockResolvedValue(0) };
      await expect(service.lookup({ ...auditor, vendorId: 'vendor-a' }, 'CH-1')).rejects.toThrow(NotFoundException);
      expect(prisma.project.count.mock.calls[0][0].where).toEqual({ id: PROJECT, team: { teamLead: { vendorAssignments: { some: { vendorId: 'vendor-a', isActive: true } } } } });
      prisma.project.count.mockResolvedValueOnce(1);
      await expect(service.lookup({ ...auditor, vendorId: 'vendor-a' }, 'CH-1')).resolves.toBeDefined();
    });

    it('a Vendor account lists only its vendor\'s audits; a Manager vendor filter only narrows', async () => {
      const inV = { some: { vendorId: 'vendor-a', isActive: true } };
      await service.list({ ...manager, role: 'VENDOR', vendorId: 'vendor-a' }, { page: 1, pageSize: 25 } as any);
      expect(prisma.auditEntry.findMany.mock.calls[0][0].where.AND[0]).toEqual({ productionEntry: { chart: { project: { team: { teamLead: { vendorAssignments: inV } } } } } });
      await service.list(manager, { page: 1, pageSize: 25, vendorId: 'vendor-a' } as any);
      expect(prisma.auditEntry.findMany.mock.calls[1][0].where.AND).toEqual([{}, { productionEntry: { chart: { project: { team: { teamLead: { vendorAssignments: inV } } } } } }]);
    });
  });
});
