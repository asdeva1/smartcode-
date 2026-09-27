import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { ChartsService } from './charts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from '../../common/export/export.service';

const base: AuthUser = { id: 'u', employeeId: 'E', loginName: 'u', email: 'u@x.local', role: 'MANAGER', teamId: null, isActive: true };
const manager = base;
const teamLead: AuthUser = { ...base, id: 'tl', role: 'TEAM_LEAD', teamId: 'team-1' };
const teamLeadNoTeam: AuthUser = { ...teamLead, teamId: null };
const coder: AuthUser = { ...base, id: 'c', role: 'CODER', teamId: 'team-1' };
const auditor: AuthUser = { ...base, id: 'a', role: 'AUDITOR' };

const chartRow = {
  chartId: 'CH-1', projectId: 'p', assignedCoderId: null, createdAt: new Date('2026-01-01'),
  project: { id: 'p', name: 'Proj', teamId: 'team-1', client: { id: 'cl', name: 'Client' }, team: { name: 'Team One' } },
  productionEntries: [
    {
      version: 2, status: 'COMPLETED', codedDate: new Date('2026-01-05'), updatedAt: new Date('2026-01-06'),
      coder: { id: 'c', fullName: 'Cody', employeeId: 'E1', loginName: 'cody' },
      auditEntries: [{ status: 'REJECTED', totalErrors: 4 }],
    },
  ],
};

describe('ChartsService (Chart Repository)', () => {
  let service: ChartsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      chart: { findMany: jest.fn().mockResolvedValue([chartRow]), count: jest.fn().mockResolvedValue(1), findFirst: jest.fn().mockResolvedValue(chartRow) },
      productionEntry: { findMany: jest.fn().mockResolvedValue([]) },
      auditEntry: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ChartsService, ExportService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ChartsService);
  });

  it('summarises the current version and latest audit without duplicating data', async () => {
    const { data } = await service.list(manager, { page: 1, pageSize: 25 });
    expect(data[0]).toMatchObject({
      chartId: 'CH-1', teamName: 'Team One', currentVersion: 2, productionStatus: 'COMPLETED', codedDate: '2026-01-05',
      auditState: 'REJECTED', latestTotalErrors: 4, isRework: true, coder: { loginName: 'cody' },
    });
  });

  it.each([
    ['Manager', manager, {}],
    ['Team Lead', teamLead, { project: { teamId: 'team-1' } }],
    ['Coder', coder, { productionEntries: { some: { coderId: 'c' } } }],
    ['Auditor', auditor, { project: { auditorAssignments: { some: { auditorId: 'a' } } } }],
  ])('scopes the %s view', async (_l, who, scope) => {
    await service.list(who, { page: 1, pageSize: 25, search: 'CH', auditState: 'NOT_AUDITED' });
    const and = prisma.chart.findMany.mock.calls[0][0].where.AND;
    expect(and[0]).toEqual(scope);
    expect(and).toContainEqual({ chartId: { contains: 'CH', mode: 'insensitive' } });
    expect(and).toContainEqual({ productionEntries: { some: { isCurrent: true, auditEntries: { none: {} } } } });
  });

  it('rejects a Team Lead with no team', async () => {
    await expect(service.list(teamLeadNoTeam, { page: 1, pageSize: 25 })).rejects.toThrow(ForbiddenException);
  });

  it('returns detail with production and audit history, 404 outside scope', async () => {
    const detail = await service.get(teamLead, 'CH-1');
    expect(detail).toHaveProperty('productionHistory');
    expect(prisma.productionEntry.findMany.mock.calls[0][0]).toMatchObject({ where: { chartId: 'CH-1' }, orderBy: { version: 'desc' } });
    expect(prisma.auditEntry.findMany.mock.calls[0][0].where).toEqual({ productionEntry: { chartId: 'CH-1' } });
    prisma.chart.findFirst.mockResolvedValueOnce(null);
    await expect(service.get(teamLead, 'CH-X')).rejects.toThrow(NotFoundException);
  });

  it('never shows audit history to a Coder', async () => {
    const detail = await service.get(coder, 'CH-1');
    expect(detail.auditHistory).toEqual([]);
    expect(prisma.auditEntry.findMany).not.toHaveBeenCalled();
  });
});
