import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { REPORTS_BY_ROLE, REPORT_KEYS, type AuthUser } from '@smartcode/types';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from '../../common/export/export.service';

const manager: AuthUser = { id: 'm', employeeId: 'E', loginName: 'm', email: 'm@x.local', role: 'MANAGER', teamId: null, isActive: true };
const teamLead: AuthUser = { ...manager, id: 'tl', role: 'TEAM_LEAD', teamId: 'team-1' };
const coder: AuthUser = { ...manager, id: 'c', role: 'CODER', teamId: 'team-1' };
const auditor: AuthUser = { ...manager, id: 'a', role: 'AUDITOR' };

const person = (id: string, fullName: string) => ({ id, fullName, employeeId: `E-${id}`, loginName: `${id}.login`, teamId: 'team-1' });
const prod = (coderId: string, status: string, pages: number, errors?: number) => ({
  id: `${coderId}-${status}-${pages}`, chartId: `CH-${pages}`, coderId, version: 1, isCurrent: true, status, pageCount: pages, totalDOS: 1, totalICDs: 2,
  remarks: null, codedDate: new Date('2026-01-10'), createdAt: new Date(), updatedAt: new Date(),
  coder: person(coderId, coderId.toUpperCase()), chart: { project: { id: 'p', name: 'Proj', teamId: 'team-1', client: { id: 'cl', name: 'C' } } },
  _count: { auditEntries: errors === undefined ? 0 : 1 },
  auditEntries: errors === undefined ? [] : [{ status: 'COMPLETED', totalErrors: errors }],
});

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      productionEntry: {
        findMany: jest.fn().mockResolvedValue([prod('c1', 'COMPLETED', 10, 3), prod('c1', 'REWORK', 5), prod('c2', 'COMPLETED', 7)]),
        count: jest.fn().mockResolvedValue(0),
      },
      auditEntry: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { totalErrors: 9 } }) },
      user: { count: jest.fn().mockResolvedValue(2) },
      chart: { count: jest.fn().mockResolvedValue(5) },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      auditorProjectAssignment: { count: jest.fn().mockResolvedValue(1) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ReportsService, ExportService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ReportsService);
  });

  it('only runs reports allowed for the caller\'s role', async () => {
    await expect(service.report(coder, 'auditor-productivity')).rejects.toThrow(ForbiddenException);
    await expect(service.report(auditor, 'production-detail')).rejects.toThrow(ForbiddenException);
    await expect(service.report(manager, 'nope')).rejects.toThrow(NotFoundException);
  });

  it('summarises current production by status with a total row', async () => {
    const r = await service.report(teamLead, 'production-summary', '2026-01-01', '2026-01-31');
    expect(prisma.productionEntry.findMany.mock.calls[0][0].where.AND).toEqual([
      { coder: { teamId: 'team-1' } },
      { isCurrent: true },
      { codedDate: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-31T23:59:59.999Z') } },
    ]);
    expect(r.rows.find((x) => x.status === 'COMPLETED')).toEqual({ status: 'COMPLETED', charts: 2, pages: 17, dos: 2, icds: 4 });
    expect(r.rows.at(-1)).toEqual({ status: 'TOTAL', charts: 3, pages: 22, dos: 3, icds: 6 });
    expect(r.filters).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('computes coder productivity from real counts (no CPH figure)', async () => {
    const r = await service.report(manager, 'coder-productivity');
    expect(r.rows[0]).toMatchObject({ coder: 'C1', charts: 2, completed: 1, rework: 1, pages: 15, audited: 1, totalErrors: 3 });
    expect(r.columns.map((c) => c.label.toLowerCase()).join(' ')).not.toMatch(/cph|per hour/);
  });

  it('scopes a Coder\'s reports to their own records', async () => {
    await service.report(coder, 'production-detail');
    expect(prisma.productionEntry.findMany.mock.calls[0][0].where.AND[0]).toEqual({ coderId: 'c' });
  });

  it('every role has at least one report and only known keys', () => {
    for (const keys of Object.values(REPORTS_BY_ROLE)) {
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) expect(REPORT_KEYS).toContain(k);
    }
  });

  it('builds role dashboards from real data using the caller\'s local "today"', async () => {
    const tl = await service.dashboard(teamLead, '2026-01-10');
    expect(tl.metrics.map((m) => m.key)).toEqual(['activeCoders', 'inactiveCoders', 'charts', 'completed', 'inProgress', 'rework', 'todayCharts', 'todayPages']);
    const todayCall = prisma.productionEntry.findMany.mock.calls.at(-1)[0].where.AND;
    expect(todayCall[2]).toEqual({ codedDate: { gte: new Date('2026-01-10T00:00:00.000Z'), lte: new Date('2026-01-10T23:59:59.999Z') } });

    const a = await service.dashboard(auditor);
    expect(a.metrics.find((m) => m.key === 'totalErrors')?.value).toBe(9);
    const m = await service.dashboard(manager);
    expect(m.metrics.find((x) => x.key === 'charts')?.value).toBe(5);
  });

  describe('report ownership, periods and filters', () => {
    const vendor: AuthUser = { ...manager, id: 'v', role: 'VENDOR', vendorId: 'vendor-a' };
    const inV = { some: { vendorId: 'vendor-a', isActive: true } };
    const where = () => prisma.productionEntry.findMany.mock.calls.at(-1)[0].where.AND;

    it('tags each report with its family and owner: Team Lead owns Internal Production, Auditor owns Internal Audit', async () => {
      expect(await service.report(teamLead, 'production-summary')).toMatchObject({ family: 'INTERNAL_PRODUCTION', familyTitle: 'Internal Production Report', ownerRole: 'TEAM_LEAD', access: 'owner' });
      expect(await service.report(auditor, 'audit-summary')).toMatchObject({ family: 'INTERNAL_AUDIT', familyTitle: 'Internal Audit Report', ownerRole: 'AUDITOR', access: 'owner' });
      expect(await service.report(manager, 'audit-summary')).toMatchObject({ access: 'viewer' });
      expect(await service.report(vendor, 'production-summary')).toMatchObject({ access: 'viewer' });
    });

    it('resolves a named period against the caller\'s local "today" into the query range', async () => {
      const r = await service.report(teamLead, 'production-summary', { period: 'last_month', today: '2026-03-15' });
      expect(where()[2]).toEqual({ codedDate: { gte: new Date('2026-02-01T00:00:00.000Z'), lte: new Date('2026-02-28T23:59:59.999Z') } });
      expect(r.filters).toEqual({ from: '2026-02-01', to: '2026-02-28', period: 'last_month' });
      await expect(service.report(teamLead, 'production-summary', { period: 'custom', from: '2026-03-01' })).rejects.toThrow(BadRequestException);
    });

    it('refuses filters a role is not authorised to use (403), before querying', async () => {
      await expect(service.report(teamLead, 'production-summary', { vendorId: 'vendor-b' })).rejects.toThrow('The Vendor filter is not available for your role');
      await expect(service.report(auditor, 'audit-summary', { teamLeadId: 'x' })).rejects.toThrow(ForbiddenException);
      await expect(service.report(vendor, 'production-summary', { vendorId: 'vendor-b' })).rejects.toThrow(ForbiddenException);
      await expect(service.report(coder, 'production-summary', { projectId: 'p' })).rejects.toThrow(ForbiddenException);
      expect(prisma.productionEntry.findMany).not.toHaveBeenCalled();
    });

    it('applies authorised filters on top of (never instead of) the caller scope', async () => {
      await service.report(manager, 'production-summary', { vendorId: 'vendor-a', teamLeadId: 'tl-9', projectId: 'p-1' });
      expect(where()).toEqual([{}, { isCurrent: true }, { coder: { team: { teamLead: { vendorAssignments: inV } } } }, { coder: { team: { teamLeadId: 'tl-9' } } }, { chart: { projectId: 'p-1' } }]);
      await service.report(teamLead, 'production-detail', { coderId: 'c9' });
      expect(where()).toEqual([{ coder: { teamId: 'team-1' } }, { isCurrent: true }, { coderId: 'c9' }]);
      await service.report(vendor, 'production-summary', { teamId: 'team-7' });
      expect(where()).toEqual([{ coder: { team: { teamLead: { vendorAssignments: inV } } } }, { isCurrent: true }, { coder: { teamId: 'team-7' } }]);
      await service.report(manager, 'audit-summary', { auditorId: 'aud-9' });
      expect(prisma.auditEntry.findMany.mock.calls.at(-1)[0].where.AND).toEqual([{}, { auditorId: 'aud-9' }]);
    });

    it('groups summary reports by period with empty periods and a TOTAL row', async () => {
      prisma.productionEntry.findMany.mockResolvedValueOnce([
        { ...prod('c1', 'COMPLETED', 10), codedDate: new Date('2026-01-05') },
        { ...prod('c1', 'REWORK', 4), codedDate: new Date('2026-03-20') },
      ]);
      const r = await service.report(manager, 'production-summary', { from: '2026-01-01', to: '2026-03-31', groupBy: 'month' });
      expect(r.columns.map((c) => c.key)).toEqual(['period', 'charts', 'completed', 'pages', 'dos', 'icds']);
      expect(r.rows).toEqual([
        { period: 'Jan 2026', charts: 1, completed: 1, pages: 10, dos: 1, icds: 2 },
        { period: 'Feb 2026', charts: 0, completed: 0, pages: 0, dos: 0, icds: 0 },
        { period: 'Mar 2026', charts: 1, completed: 0, pages: 4, dos: 1, icds: 2 },
        { period: 'TOTAL', charts: 2, completed: 1, pages: 14, dos: 2, icds: 4 },
      ]);
      await expect(service.report(manager, 'production-detail', { groupBy: 'month' })).rejects.toThrow('cannot be grouped');
    });

    it('scopes a Vendor\'s reports to its own vendor and audit-logs report generation on export', async () => {
      await service.report(vendor, 'production-summary');
      expect(where()[0]).toEqual({ coder: { team: { teamLead: { vendorAssignments: inV } } } });
      await service.export(vendor, 'production-summary', 'csv', { period: 'this_year', today: '2026-09-27' });
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        action: 'REPORT_GENERATED', entity: 'Report', entityId: 'production-summary', role: 'VENDOR',
        after: { format: 'csv', family: 'INTERNAL_PRODUCTION', from: '2026-01-01', to: '2026-09-27', period: 'this_year' },
      });
    });
  });
});
