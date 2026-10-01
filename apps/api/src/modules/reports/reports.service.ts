import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  GROUPABLE_REPORTS,
  PeriodError,
  REPORTS_BY_ROLE,
  REPORT_FAMILY_INFO,
  REPORT_FAMILY_OF,
  REPORT_FILTERS_BY_ROLE,
  REPORT_FILTER_KEYS,
  REPORT_GROUPING_LABELS,
  REPORT_KEYS,
  REPORT_TITLES,
  enumerateBuckets,
  isValidIsoDate,
  periodBucket,
  reportFamilyAccess,
  resolvePeriod,
  todayInTimeZone,
  type AuthUser,
  type ExportFormat,
  type ReportCell,
  type ReportColumn,
  type ReportFilterKey,
  type ReportGrouping,
  type ReportKey,
  type ReportQuery,
} from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from '../../common/export/export.service';
import { writeAuditLog } from '../../common/audit-log';
import { auditScope, dateRange, isoDay, productionScope, requireTeam } from '../../common/scope';
import { auditorProjectWhere, vendorAuditWhere, vendorProductionWhere } from '../../common/vendor-scope';
import { PRODUCTION_EXPORT_COLUMNS, PRODUCTION_INCLUDE, productionExportRow } from '../production/production.service';
import { AUDIT_EXPORT_COLUMNS, AUDIT_INCLUDE, auditExportRow } from '../audits/audit.mapper';

type Row = Record<string, ReportCell>;
interface Built {
  columns: ReportColumn[];
  rows: Row[];
}

const PROD_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REWORK', 'CANCELLED'] as const;
const AUDIT_STATUS_LIST = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REVIEW_REQUIRED', 'REJECTED'] as const;
const sum = <T>(items: T[], f: (t: T) => number) => items.reduce((a, t) => a + f(t), 0);
const name = (p: { fullName: string | null; loginName: string }) => p.fullName ?? p.loginName;

const FILTER_LABEL: Record<ReportFilterKey, string> = {
  vendorId: 'Vendor',
  teamLeadId: 'Team Lead',
  auditorId: 'Auditor',
  teamId: 'Team',
  projectId: 'Project',
  coderId: 'Coder',
};

interface Range {
  from?: string;
  to?: string;
}

/** Legacy positional (from, to) calls and the full query object are both accepted. */
function normalize(arg?: string | ReportQuery, to?: string): ReportQuery {
  if (arg === undefined || typeof arg === 'string') return { from: arg, to };
  return arg;
}

/** Server-side "today" only when the client did not send its own: an explicit IANA zone, never the host's. */
function serverToday(): string {
  try {
    return todayInTimeZone(process.env.APP_TIMEZONE || 'UTC');
  } catch {
    return todayInTimeZone('UTC');
  }
}

/** Filters narrow the caller's scope (AND); each maps to the same relation path the scopes use. */
function productionFilters(q: ReportQuery): Prisma.ProductionEntryWhereInput[] {
  const out: Prisma.ProductionEntryWhereInput[] = [];
  if (q.vendorId) out.push(vendorProductionWhere(q.vendorId));
  if (q.teamLeadId) out.push({ coder: { team: { teamLeadId: q.teamLeadId } } });
  if (q.teamId) out.push({ coder: { teamId: q.teamId } });
  if (q.projectId) out.push({ chart: { projectId: q.projectId } });
  if (q.coderId) out.push({ coderId: q.coderId });
  if (q.auditorId) out.push({ auditEntries: { some: { auditorId: q.auditorId } } });
  return out;
}

function auditFilters(q: ReportQuery): Prisma.AuditEntryWhereInput[] {
  const out: Prisma.AuditEntryWhereInput[] = [];
  if (q.vendorId) out.push(vendorAuditWhere(q.vendorId));
  if (q.teamLeadId) out.push({ productionEntry: { chart: { project: { team: { teamLeadId: q.teamLeadId } } } } });
  if (q.teamId) out.push({ productionEntry: { chart: { project: { teamId: q.teamId } } } });
  if (q.projectId) out.push({ productionEntry: { chart: { projectId: q.projectId } } });
  if (q.coderId) out.push({ productionEntry: { coderId: q.coderId } });
  if (q.auditorId) out.push({ auditorId: q.auditorId });
  return out;
}

/**
 * Foundational, role-scoped reports computed from current Production
 * versions and Audit rows. Every query starts from the same scope helpers
 * the list endpoints use, so a report can never show more than the
 * caller's own screens. Productivity is counts/sums only - no CPH figure
 * (no hours data or formula config exists).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: ExportService,
  ) {}

  private assertAllowed(caller: AuthUser, key: string): ReportKey {
    if (!(REPORT_KEYS as readonly string[]).includes(key)) throw new NotFoundException(`Unknown report "${key}"`);
    if (!REPORTS_BY_ROLE[caller.role].includes(key as ReportKey)) {
      throw new ForbiddenException('This report is not available for your role');
    }
    return key as ReportKey;
  }

  /** Named period -> concrete range (via the shared period utility); otherwise the explicit from/to. */
  private range(q: ReportQuery): Range {
    if (!q.period) return { from: q.from, to: q.to };
    const today = q.today && isValidIsoDate(q.today) ? q.today : serverToday();
    try {
      return resolvePeriod(q.period, today, { from: q.from, to: q.to });
    } catch (e) {
      if (e instanceof PeriodError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  /** A filter the role may not use is refused outright - never silently ignored. */
  private assertFilters(caller: AuthUser, q: ReportQuery) {
    const allowed = REPORT_FILTERS_BY_ROLE[caller.role] ?? [];
    for (const key of REPORT_FILTER_KEYS) {
      if (q[key] && !allowed.includes(key)) {
        throw new ForbiddenException(`The ${FILTER_LABEL[key]} filter is not available for your role`);
      }
    }
  }

  private productions(caller: AuthUser, q: ReportQuery, r: Range) {
    const range = dateRange(r.from, r.to);
    return this.prisma.productionEntry.findMany({
      where: { AND: [productionScope(caller), { isCurrent: true }, ...(range ? [{ codedDate: range }] : []), ...productionFilters(q)] },
      include: {
        ...PRODUCTION_INCLUDE,
        auditEntries: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, totalErrors: true } },
      },
      orderBy: [{ codedDate: 'desc' }, { createdAt: 'desc' }],
      take: 10_000,
    });
  }

  private audits(caller: AuthUser, q: ReportQuery, r: Range) {
    const range = dateRange(r.from, r.to);
    return this.prisma.auditEntry.findMany({
      where: { AND: [auditScope(caller), ...(range ? [{ auditDate: range }] : []), ...auditFilters(q)] },
      include: AUDIT_INCLUDE,
      orderBy: [{ auditDate: 'desc' }, { createdAt: 'desc' }],
      take: 10_000,
    });
  }

  /**
   * Summary rows per period bucket (every bucket in the range, so empty
   * periods show as zero), plus a TOTAL row. Bucketing uses the shared
   * period utility on the stored calendar date.
   */
  private grouped<T>(
    items: T[],
    dateOf: (t: T) => string,
    range: Range,
    grouping: ReportGrouping,
    metrics: { key: string; label: string; value: (g: T[]) => number }[],
  ): Built {
    const columns: ReportColumn[] = [{ key: 'period', label: `Period (${REPORT_GROUPING_LABELS[grouping]})` }, ...metrics.map((m) => ({ key: m.key, label: m.label, numeric: true }))];
    const dates = items.map(dateOf).sort();
    const from = range.from ?? dates[0];
    const to = range.to ?? dates[dates.length - 1];
    if (!from || !to) return { columns, rows: [] };
    let buckets;
    try {
      buckets = enumerateBuckets({ from, to }, grouping);
    } catch (e) {
      if (e instanceof PeriodError) throw new BadRequestException(e.message);
      throw e;
    }
    const byKey = new Map<string, T[]>();
    for (const item of items) {
      const k = periodBucket(dateOf(item), grouping, { from, to }).key;
      byKey.set(k, [...(byKey.get(k) ?? []), item]);
    }
    const line = (period: string, g: T[]): Row => Object.fromEntries([['period', period], ...metrics.map((m) => [m.key, m.value(g)])]);
    return { columns, rows: [...buckets.map((b) => line(b.label, byKey.get(b.key) ?? [])), line('TOTAL', items)] };
  }

  async build(caller: AuthUser, key: ReportKey, q: ReportQuery = {}, r: Range = { from: q.from, to: q.to }): Promise<Built> {
    if (q.groupBy && !GROUPABLE_REPORTS.includes(key)) {
      throw new BadRequestException(`${REPORT_TITLES[key]} cannot be grouped by period`);
    }
    switch (key) {
      case 'production-summary': {
        const rows = await this.productions(caller, q, r);
        if (q.groupBy) {
          return this.grouped(rows, (x) => isoDay(x.codedDate)!, r, q.groupBy, [
            { key: 'charts', label: 'Charts', value: (g) => g.length },
            { key: 'completed', label: 'Completed', value: (g) => g.filter((x) => x.status === 'COMPLETED').length },
            { key: 'pages', label: 'Pages', value: (g) => sum(g, (x) => x.pageCount) },
            { key: 'dos', label: 'Total DOS', value: (g) => sum(g, (x) => x.totalDOS) },
            { key: 'icds', label: 'Total ICDs', value: (g) => sum(g, (x) => x.totalICDs) },
          ]);
        }
        const out: Row[] = PROD_STATUSES.map((status) => {
          const g = rows.filter((r) => r.status === status);
          return { status, charts: g.length, pages: sum(g, (r) => r.pageCount), dos: sum(g, (r) => r.totalDOS), icds: sum(g, (r) => r.totalICDs) };
        });
        out.push({ status: 'TOTAL', charts: rows.length, pages: sum(rows, (r) => r.pageCount), dos: sum(rows, (r) => r.totalDOS), icds: sum(rows, (r) => r.totalICDs) });
        return {
          columns: [
            { key: 'status', label: 'Production Status' },
            { key: 'charts', label: 'Charts', numeric: true },
            { key: 'pages', label: 'Pages', numeric: true },
            { key: 'dos', label: 'Total DOS', numeric: true },
            { key: 'icds', label: 'Total ICDs', numeric: true },
          ],
          rows: out,
        };
      }
      case 'coder-productivity': {
        const rows = await this.productions(caller, q, r);
        const byCoder = new Map<string, typeof rows>();
        for (const r of rows) byCoder.set(r.coderId, [...(byCoder.get(r.coderId) ?? []), r]);
        return {
          columns: [
            { key: 'coder', label: 'Coder Name' },
            { key: 'employeeId', label: 'Employee ID' },
            { key: 'loginName', label: 'Login Name' },
            { key: 'charts', label: 'Charts', numeric: true },
            { key: 'completed', label: 'Completed', numeric: true },
            { key: 'inProgress', label: 'Pending / In Progress', numeric: true },
            { key: 'rework', label: 'Rework', numeric: true },
            { key: 'pages', label: 'Pages', numeric: true },
            { key: 'dos', label: 'Total DOS', numeric: true },
            { key: 'icds', label: 'Total ICDs', numeric: true },
            { key: 'audited', label: 'Audited', numeric: true },
            { key: 'totalErrors', label: 'Total Errors', numeric: true },
          ],
          rows: [...byCoder.values()]
            .map((g) => ({
              coder: name(g[0].coder),
              employeeId: g[0].coder.employeeId,
              loginName: g[0].coder.loginName,
              charts: g.length,
              completed: g.filter((r) => r.status === 'COMPLETED').length,
              inProgress: g.filter((r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS').length,
              rework: g.filter((r) => r.status === 'REWORK').length,
              pages: sum(g, (r) => r.pageCount),
              dos: sum(g, (r) => r.totalDOS),
              icds: sum(g, (r) => r.totalICDs),
              audited: g.filter((r) => r.auditEntries.length > 0).length,
              totalErrors: sum(g, (r) => r.auditEntries[0]?.totalErrors ?? 0),
            }))
            .sort((a, b) => b.charts - a.charts),
        };
      }
      case 'production-detail': {
        const rows = await this.productions(caller, q, r);
        return { columns: PRODUCTION_EXPORT_COLUMNS, rows: rows.map(productionExportRow) as Row[] };
      }
      case 'audit-summary': {
        const rows = await this.audits(caller, q, r);
        if (q.groupBy) {
          return this.grouped(rows, (x) => isoDay(x.auditDate)!, r, q.groupBy, [
            { key: 'audits', label: 'Audits', value: (g) => g.length },
            { key: 'auditErrors', label: 'Audit Errors', value: (g) => sum(g, (x) => x.auditErrors) },
            { key: 'errorExceptions', label: 'Error Exceptions', value: (g) => sum(g, (x) => x.errorExceptions) },
            { key: 'totalErrors', label: 'Total Errors', value: (g) => sum(g, (x) => x.totalErrors) },
          ]);
        }
        const line = (status: string, g: typeof rows): Row => ({
          status,
          audits: g.length,
          auditErrors: sum(g, (r) => r.auditErrors),
          errorExceptions: sum(g, (r) => r.errorExceptions),
          totalErrors: sum(g, (r) => r.totalErrors),
        });
        return {
          columns: [
            { key: 'status', label: 'Audit Status' },
            { key: 'audits', label: 'Audits', numeric: true },
            { key: 'auditErrors', label: 'Audit Errors', numeric: true },
            { key: 'errorExceptions', label: 'Error Exceptions', numeric: true },
            { key: 'totalErrors', label: 'Total Errors', numeric: true },
          ],
          rows: [...AUDIT_STATUS_LIST.map((s) => line(s, rows.filter((r) => r.status === s))), line('TOTAL', rows)],
        };
      }
      case 'auditor-productivity': {
        const rows = await this.audits(caller, q, r);
        const by = new Map<string, typeof rows>();
        for (const r of rows) by.set(r.auditorId, [...(by.get(r.auditorId) ?? []), r]);
        const count = (g: typeof rows, s: string) => g.filter((r) => r.status === s).length;
        return {
          columns: [
            { key: 'auditor', label: 'Auditor' },
            { key: 'employeeId', label: 'Employee ID' },
            { key: 'loginName', label: 'Login Name' },
            { key: 'audits', label: 'Audits', numeric: true },
            { key: 'completed', label: 'Completed', numeric: true },
            { key: 'inProgress', label: 'Pending / In Progress', numeric: true },
            { key: 'reviewRequired', label: 'Review Required', numeric: true },
            { key: 'rejected', label: 'Rejected', numeric: true },
            { key: 'totalErrors', label: 'Total Errors', numeric: true },
          ],
          rows: [...by.values()]
            .map((g) => ({
              auditor: name(g[0].auditor),
              employeeId: g[0].auditor.employeeId,
              loginName: g[0].auditor.loginName,
              audits: g.length,
              completed: count(g, 'COMPLETED'),
              inProgress: count(g, 'PENDING') + count(g, 'IN_PROGRESS'),
              reviewRequired: count(g, 'REVIEW_REQUIRED'),
              rejected: count(g, 'REJECTED'),
              totalErrors: sum(g, (r) => r.totalErrors),
            }))
            .sort((a, b) => b.audits - a.audits),
        };
      }
      case 'error-summary': {
        const rows = await this.audits(caller, q, r);
        const by = new Map<string, typeof rows>();
        for (const r of rows) {
          const id = r.productionEntry.coder.id;
          by.set(id, [...(by.get(id) ?? []), r]);
        }
        return {
          columns: [
            { key: 'coder', label: 'Coder Name' },
            { key: 'employeeId', label: 'Employee ID' },
            { key: 'audits', label: 'Audits', numeric: true },
            { key: 'auditErrors', label: 'Audit Errors', numeric: true },
            { key: 'errorExceptions', label: 'Error Exceptions', numeric: true },
            { key: 'totalErrors', label: 'Total Errors', numeric: true },
          ],
          rows: [...by.values()]
            .map((g) => ({
              coder: name(g[0].productionEntry.coder),
              employeeId: g[0].productionEntry.coder.employeeId,
              audits: g.length,
              auditErrors: sum(g, (r) => r.auditErrors),
              errorExceptions: sum(g, (r) => r.errorExceptions),
              totalErrors: sum(g, (r) => r.totalErrors),
            }))
            .sort((a, b) => b.totalErrors - a.totalErrors),
        };
      }
      case 'assigned-charts': {
        const projects = await this.prisma.project.findMany({
          where: { ...auditorProjectWhere(caller), ...(q.projectId ? { id: q.projectId } : {}) },
          include: {
            client: { select: { name: true } },
            charts: {
              select: {
                productionEntries: {
                  where: { isCurrent: true },
                  select: { status: true, auditEntries: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, auditorId: true } } },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
        });
        return {
          columns: [
            { key: 'project', label: 'Project' },
            { key: 'client', label: 'Client' },
            { key: 'charts', label: 'Charts', numeric: true },
            { key: 'awaiting', label: 'Awaiting Audit', numeric: true },
            { key: 'inProgress', label: 'Audit In Progress', numeric: true },
            { key: 'completed', label: 'Audit Completed', numeric: true },
            { key: 'rejected', label: 'Rejected (Rework)', numeric: true },
          ],
          rows: projects.map((p) => {
            const current = p.charts.map((c) => c.productionEntries[0]).filter(Boolean);
            const latest = (s: string) => current.filter((c) => c.auditEntries[0]?.status === s).length;
            return {
              project: p.name,
              client: p.client.name,
              charts: p.charts.length,
              awaiting: current.filter((c) => c.status === 'COMPLETED' && c.auditEntries.length === 0).length,
              inProgress: latest('PENDING') + latest('IN_PROGRESS'),
              completed: latest('COMPLETED'),
              rejected: latest('REJECTED'),
            };
          }),
        };
      }
      case 'audit-detail': {
        const rows = await this.audits(caller, q, r);
        return { columns: AUDIT_EXPORT_COLUMNS, rows: rows.map(auditExportRow) as Row[] };
      }
    }
  }

  /** Validation shared by view and export: role may run the report, may use each filter, and the period resolves. */
  private prepare(caller: AuthUser, key: string, arg?: string | ReportQuery, to?: string) {
    const report = this.assertAllowed(caller, key);
    const q = normalize(arg, to);
    this.assertFilters(caller, q);
    return { report, q, range: this.range(q) };
  }

  private echo(q: ReportQuery, range: Range) {
    const extra: Record<string, string> = {};
    if (q.period) extra.period = q.period;
    if (q.groupBy) extra.groupBy = q.groupBy;
    for (const k of REPORT_FILTER_KEYS) if (q[k]) extra[k] = q[k]!;
    return { from: range.from ?? null, to: range.to ?? null, ...extra };
  }

  async report(caller: AuthUser, key: string, arg?: string | ReportQuery, to?: string) {
    const { report, q, range } = this.prepare(caller, key, arg, to);
    const built = await this.build(caller, report, q, range);
    const family = REPORT_FAMILY_OF[report];
    return {
      report,
      title: REPORT_TITLES[report],
      family,
      familyTitle: REPORT_FAMILY_INFO[family].title,
      ownerRole: REPORT_FAMILY_INFO[family].owner,
      access: reportFamilyAccess(caller.role, family) ?? 'viewer',
      ...built,
      generatedAt: new Date().toISOString(),
      filters: this.echo(q, range),
    };
  }

  async export(caller: AuthUser, key: string, format: ExportFormat, arg?: string | ReportQuery, to?: string) {
    const { report, q, range } = this.prepare(caller, key, arg, to);
    const built = await this.build(caller, report, q, range);
    const filters = this.echo(q, range);
    // Report generation is a compliance event (the file leaves the system).
    await writeAuditLog(this.prisma, caller, 'REPORT_GENERATED', 'Report', report, {
      after: { format, family: REPORT_FAMILY_OF[report], rows: built.rows.length, ...filters },
    });
    return this.exporter.stream(format, {
      title: `${REPORT_FAMILY_INFO[REPORT_FAMILY_OF[report]].title} - ${REPORT_TITLES[report]}`,
      generatedBy: caller.loginName,
      filters: { ...filters, from: filters.from ?? undefined, to: filters.to ?? undefined },
      columns: built.columns,
      rows: built.rows,
    });
  }

  // ─── dashboards ─────────────────────────────────────────────

  async dashboard(caller: AuthUser, today?: string) {
    const day = today && isValidIsoDate(today) ? today : new Date().toISOString().slice(0, 10);
    const todayRange = dateRange(day, day)!;
    const m = (key: string, label: string, value: number) => ({ key, label, value });
    const cur = (extra: Prisma.ProductionEntryWhereInput = {}): Prisma.ProductionEntryWhereInput => ({
      AND: [productionScope(caller), { isCurrent: true }, extra],
    });

    if (caller.role === 'MANAGER') {
      const [tls, auditors, coders, charts, completed, pendingAudit, auditsDone] = await Promise.all([
        this.prisma.user.count({ where: { role: 'TEAM_LEAD', isActive: true } }),
        this.prisma.user.count({ where: { role: 'AUDITOR', isActive: true } }),
        this.prisma.user.count({ where: { role: 'CODER', isActive: true } }),
        this.prisma.chart.count(),
        this.prisma.productionEntry.count({ where: { isCurrent: true, status: 'COMPLETED' } }),
        this.prisma.productionEntry.count({ where: { isCurrent: true, status: 'COMPLETED', auditEntries: { none: {} } } }),
        this.prisma.auditEntry.count({ where: { status: 'COMPLETED' } }),
      ]);
      return {
        role: caller.role,
        metrics: [
          m('activeTeamLeads', 'Active Team Leads', tls),
          m('activeAuditors', 'Active Auditors', auditors),
          m('activeCoders', 'Active Coders', coders),
          m('charts', 'Charts', charts),
          m('productionCompleted', 'Production Completed', completed),
          m('awaitingAudit', 'Awaiting Audit', pendingAudit),
          m('auditsCompleted', 'Audits Completed', auditsDone),
        ],
      };
    }

    if (caller.role === 'TEAM_LEAD' || caller.role === 'CODER') {
      const team = caller.role === 'TEAM_LEAD' ? requireTeam(caller) : null;
      const [active, inactive, all, completed, inProgress, rework, todayRows] = await Promise.all([
        team ? this.prisma.user.count({ where: { role: 'CODER', teamId: team, isActive: true } }) : Promise.resolve(0),
        team ? this.prisma.user.count({ where: { role: 'CODER', teamId: team, isActive: false } }) : Promise.resolve(0),
        this.prisma.productionEntry.count({ where: cur() }),
        this.prisma.productionEntry.count({ where: cur({ status: 'COMPLETED' }) }),
        this.prisma.productionEntry.count({ where: cur({ status: { in: ['PENDING', 'IN_PROGRESS'] } }) }),
        this.prisma.productionEntry.count({ where: cur({ status: 'REWORK' }) }),
        this.prisma.productionEntry.findMany({ where: cur({ codedDate: todayRange }), select: { pageCount: true } }),
      ]);
      const prod = [
        m('charts', caller.role === 'CODER' ? 'My Charts' : 'Team Charts', all),
        m('completed', 'Completed', completed),
        m('inProgress', 'Pending / In Progress', inProgress),
        m('rework', 'Rework', rework),
        m('todayCharts', "Today's Charts", todayRows.length),
        m('todayPages', "Today's Pages", sum(todayRows, (r) => r.pageCount)),
      ];
      return {
        role: caller.role,
        metrics: team ? [m('activeCoders', 'Active Coders', active), m('inactiveCoders', 'Inactive Coders', inactive), ...prod] : prod,
      };
    }

    // AUDITOR
    const assigned = { project: { auditorAssignments: { some: { auditorId: caller.id, isActive: true } } } };
    const mine = (status: Prisma.AuditEntryWhereInput['status']) => this.prisma.auditEntry.count({ where: { auditorId: caller.id, status } });
    const [projects, awaiting, inProgress, completed, review, rejected, todayCount, errors] = await Promise.all([
      this.prisma.auditorProjectAssignment.count({ where: { auditorId: caller.id, isActive: true } }),
      this.prisma.productionEntry.count({ where: { isCurrent: true, status: 'COMPLETED', auditEntries: { none: {} }, chart: assigned } }),
      mine({ in: ['PENDING', 'IN_PROGRESS'] }),
      mine('COMPLETED'),
      mine('REVIEW_REQUIRED'),
      mine('REJECTED'),
      this.prisma.auditEntry.count({ where: { auditorId: caller.id, auditDate: todayRange } }),
      this.prisma.auditEntry.aggregate({ where: { auditorId: caller.id }, _sum: { totalErrors: true } }),
    ]);
    return {
      role: caller.role,
      metrics: [
        m('assignedProjects', 'Assigned Projects', projects),
        m('pendingAudits', 'Pending Audits', awaiting),
        m('inProgress', 'My Audits In Progress', inProgress),
        m('completed', 'Completed Audits', completed),
        m('reviewRequired', 'Review Required', review),
        m('rejected', 'Rework / Re-audit', rejected),
        m('todayAudits', "Today's Audits", todayCount),
        m('totalErrors', 'Total Errors Found', errors._sum.totalErrors ?? 0),
      ],
    };
  }
}
