import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
});
