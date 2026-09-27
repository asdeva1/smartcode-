import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditStatus, AuthUser, ExportFormat, ProductionStatus } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from '../../common/export/export.service';
import { PERSON_SELECT, PROJECT_SELECT, chartScope, isoDay, personRef, projectRef } from '../../common/scope';
import { PRODUCTION_INCLUDE, toProductionDto } from '../production/production.service';
import { AUDIT_INCLUDE, toAuditDto } from '../audits/audit.mapper';
import { vendorChartWhere } from '../../common/vendor-scope';
import { ListChartsDto } from './dto/list-charts.dto';

const CHART_INCLUDE = {
  project: { select: { ...PROJECT_SELECT, team: { select: { name: true } } } },
  productionEntries: {
    where: { isCurrent: true },
    take: 1,
    include: {
      coder: { select: PERSON_SELECT },
      auditEntries: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, totalErrors: true } },
    },
  },
} as const;

type ChartRow = Prisma.ChartGetPayload<{ include: typeof CHART_INCLUDE }>;

function toChartSummary(c: ChartRow) {
  const current = c.productionEntries[0];
  const latestAudit = current?.auditEntries[0];
  return {
    chartId: c.chartId,
    project: projectRef(c.project),
    teamName: c.project.team?.name ?? null,
    currentVersion: current?.version ?? null,
    productionStatus: (current?.status ?? null) as ProductionStatus | null,
    coder: current ? personRef(current.coder) : null,
    codedDate: current ? isoDay(current.codedDate) : null,
    auditState: (latestAudit?.status ?? 'NOT_AUDITED') as AuditStatus | 'NOT_AUDITED',
    latestTotalErrors: latestAudit?.totalErrors ?? null,
    isRework: !!current && (current.status === 'REWORK' || current.version > 1),
    assignedCoderId: c.assignedCoderId,
    createdAt: c.createdAt,
    updatedAt: current?.updatedAt ?? null,
  };
}

/**
 * Chart Repository: one row per Chart ID with its current production
 * version and latest audit state, plus full production/audit history on
 * the detail view. Reads existing rows only - nothing is duplicated.
 */
@Injectable()
export class ChartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: ExportService,
  ) {}

  private where(caller: AuthUser, q: Partial<ListChartsDto>): Prisma.ChartWhereInput {
    const and: Prisma.ChartWhereInput[] = [chartScope(caller)];
    const search = q.search?.trim();
    if (search) and.push({ chartId: { contains: search, mode: 'insensitive' } });
    if (q.projectId) and.push({ projectId: q.projectId });
    if (q.productionStatus) {
      and.push({ productionEntries: { some: { isCurrent: true, status: q.productionStatus as ProductionStatus } } });
    }
    if (q.auditState === 'NOT_AUDITED') {
      and.push({ productionEntries: { some: { isCurrent: true, auditEntries: { none: {} } } } });
    } else if (q.auditState) {
      // Matches the current version having an audit in this status.
      and.push({ productionEntries: { some: { isCurrent: true, auditEntries: { some: { status: q.auditState as AuditStatus } } } } });
    }
    if (q.rework === 'yes') {
      and.push({ productionEntries: { some: { isCurrent: true, OR: [{ status: 'REWORK' }, { version: { gt: 1 } }] } } });
    }
    if (q.vendorId) and.push(vendorChartWhere(q.vendorId));
    return { AND: and };
  }

  async list(caller: AuthUser, q: ListChartsDto) {
    const where = this.where(caller, q);
    const [rows, total] = await Promise.all([
      this.prisma.chart.findMany({
        where,
        include: CHART_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.chart.count({ where }),
    ]);
    return { data: rows.map(toChartSummary), total, page: q.page, pageSize: q.pageSize };
  }

  private async findVisible(caller: AuthUser, chartId: string) {
    const chart = await this.prisma.chart.findFirst({ where: { AND: [{ chartId }, chartScope(caller)] }, include: CHART_INCLUDE });
    // Identical 404 whether the chart doesn't exist or is outside the caller's scope.
    if (!chart) throw new NotFoundException(`Chart ${chartId} not found`);
    return chart;
  }

  async productionHistory(caller: AuthUser, chartId: string) {
    await this.findVisible(caller, chartId);
    const rows = await this.prisma.productionEntry.findMany({
      where: { chartId },
      include: PRODUCTION_INCLUDE,
      orderBy: { version: 'desc' },
    });
    return rows.map(toProductionDto);
  }

  async auditHistory(caller: AuthUser, chartId: string) {
    await this.findVisible(caller, chartId);
    // Coders have no audit visibility (docs/03-RBAC-PERMISSIONS.md "View Audit").
    if (caller.role === 'CODER') return [];
    const rows = await this.prisma.auditEntry.findMany({
      where: { productionEntry: { chartId } },
      include: AUDIT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toAuditDto);
  }

  async get(caller: AuthUser, chartId: string) {
    const chart = await this.findVisible(caller, chartId);
    const [productionHistory, auditHistory] = await Promise.all([
      this.productionHistory(caller, chartId),
      this.auditHistory(caller, chartId),
    ]);
    return { ...toChartSummary(chart), productionHistory, auditHistory };
  }

  async export(caller: AuthUser, format: ExportFormat, q: Partial<ListChartsDto>) {
    const rows = await this.prisma.chart.findMany({ where: this.where(caller, q), include: CHART_INCLUDE, orderBy: { createdAt: 'desc' }, take: 10_000 });
    return this.exporter.stream(format, {
      title: 'Chart Repository',
      generatedBy: caller.loginName,
      filters: { search: q.search, productionStatus: q.productionStatus, auditState: q.auditState, rework: q.rework },
      columns: [
        { key: 'chartId', label: 'Chart ID' },
        { key: 'project', label: 'Project' },
        { key: 'client', label: 'Client' },
        { key: 'team', label: 'Team' },
        { key: 'version', label: 'Current Version', numeric: true },
        { key: 'productionStatus', label: 'Production Status' },
        { key: 'coder', label: 'Coder' },
        { key: 'codedDate', label: 'Coded Date' },
        { key: 'auditState', label: 'Audit Status' },
        { key: 'totalErrors', label: 'Latest Total Errors', numeric: true },
        { key: 'rework', label: 'Rework' },
      ],
      rows: rows.map(toChartSummary).map((c) => ({
        chartId: c.chartId,
        project: c.project?.name ?? '',
        client: c.project?.client?.name ?? '',
        team: c.teamName ?? '',
        version: c.currentVersion ?? '',
        productionStatus: c.productionStatus ?? '',
        coder: c.coder ? `${c.coder.fullName ?? c.coder.loginName} (${c.coder.employeeId})` : '',
        codedDate: c.codedDate ?? '',
        auditState: c.auditState,
        totalErrors: c.latestTotalErrors ?? '',
        rework: c.isRework ? 'Yes' : 'No',
      })),
    });
  }
}
