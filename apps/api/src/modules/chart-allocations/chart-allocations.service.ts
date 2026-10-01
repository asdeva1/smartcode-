import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AuthUser,
  ChartAllocationCommitResponse,
  ChartAllocationFileType,
  ChartAllocationHistoryListResponse,
  ChartAllocationHistoryRow,
  ChartAllocationImportHistoryRow,
  ChartAllocationListResponse,
  ChartAllocationMetrics,
  ChartAllocationPreviewResponse,
  ChartAllocationRowResult,
  ChartAllocationRowStatus,
  PullbackChartAllocationInput,
  ReassignChartAllocationInput,
} from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { writeAuditLog } from '../../common/audit-log';
import { PERSON_SELECT, isUniqueViolation, personRef, requireTeam } from '../../common/scope';
import { teamVendorId } from '../../common/vendor-scope';
import {
  buildAllocationSummaryFile,
  readChartAllocationUpload,
  toChartAllocationRecords,
  type UploadedChartAllocationFile,
} from '../../common/chart-allocation/chart-allocation-upload';
import { ExportChartAllocationsDto, ListChartAllocationHistoryDto, ListChartAllocationsDto } from './dto/chart-allocation.dto';

const LIVE_REWORK_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
const EXPORT_ROW_CAP = 20_000;

function capErrorSummary(results: ChartAllocationRowResult[]): string[] | undefined {
  const messages = results.filter((r) => r.status !== 'valid').flatMap((r) => r.errors.map((e) => `Row ${r.rowNumber}: ${e}`));
  return messages.length ? messages.slice(0, 200) : undefined;
}

/**
 * Phase 10D — Chart Allocation (docs/09-BUSINESS-RULES.md section 12).
 *
 * Manager exports a filtered Summary of a MANUAL project's charts; a Team
 * Lead fills in "Assigned to" (a Coder's Login Name) for the rows they
 * want to allocate and re-uploads it; SmartCode validates and commits one
 * ChartAllocation row per allocated Chart. Pullback/reassign are explicit,
 * separate operations. Deliberately does NOT touch chart-imports.service.ts
 * or its models (ChartImport/ChartImportRow/ChartImportTemplate) - the
 * client Raw-file import is a separate, untouched workflow; this service
 * only READS ChartImportRow (for the latest client attribute values) and
 * Chart.chartId (the business key it allocates against).
 *
 * INTERPRETATION NOTE (documented per this phase's explicit instruction to
 * disclose rather than invent, when the given business rules do not fully
 * resolve a case): the Manager's Summary export leaves EVERY row's
 * "Assigned to" blank; a Team Lead is not required to fill in every row of
 * every export - a row whose "Assigned to" is still blank on re-upload is
 * treated as "not part of this allocation instruction" and is silently
 * skipped (not counted in validRows/invalidRows/duplicateRows, not
 * written at commit), rather than rejected as an incomplete row. This is
 * what makes "the Team Lead allocates a subset of an export in one
 * upload" possible at all, and is consistent with rule 85 ("do not create
 * a second allocation when the same chart is uploaded again") - an
 * unfilled row is not an allocation instruction, so it cannot be a
 * duplicate one either.
 */
@Injectable()
export class ChartAllocationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── authorization ─────────────────────────────────────────────

  private assertManager(caller: AuthUser) {
    if (caller.role !== 'MANAGER') throw new ForbiddenException('Only a Manager can do this');
  }

  private async assertManagerManualProject(caller: AuthUser, projectId: string) {
    this.assertManager(caller);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.allocationType !== 'MANUAL') {
      throw new BadRequestException('Chart allocation is available only for MANUAL allocation projects.');
    }
    return project;
  }

  /** Team Lead's own team's MANUAL project only - the Summary upload path. */
  private async assertTeamLeadManualProject(caller: AuthUser, projectId: string) {
    if (caller.role !== 'TEAM_LEAD') throw new ForbiddenException('Only a Team Lead can upload a Chart Allocation Summary');
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.teamId !== requireTeam(caller)) throw new ForbiddenException('This Project is not assigned to your Team');
    if (project.allocationType !== 'MANUAL') {
      throw new BadRequestException('Chart allocation is available only for MANUAL allocation projects.');
    }
    return project;
  }

  /** Manager (any project) or Team Lead (their own team's project only) - shared authorization for pullback/reassign/history/metrics viewing. */
  private async assertManagerOrOwnTeamLeadProject(caller: AuthUser, projectId: string) {
    if (caller.role !== 'MANAGER' && caller.role !== 'TEAM_LEAD') {
      throw new ForbiddenException('Only a Manager or Team Lead can do this');
    }
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (caller.role === 'TEAM_LEAD' && project.teamId !== requireTeam(caller)) {
      throw new ForbiddenException('This Project is not assigned to your Team');
    }
    return project;
  }

  // ─── Manager: allocatable-charts list / Summary export ─────────

  private listWhere(projectId: string, query: Pick<ListChartAllocationsDto, 'search' | 'allocated'>): Prisma.ChartWhereInput {
    return {
      projectId,
      ...(query.search?.trim() ? { chartId: { contains: query.search.trim(), mode: 'insensitive' } } : {}),
      ...(query.allocated === 'allocated' ? { assignedCoderId: { not: null } } : {}),
      ...(query.allocated === 'unallocated' ? { assignedCoderId: null } : {}),
    };
  }

  private readonly LIST_INCLUDE = {
    importRows: { orderBy: { createdAt: 'desc' as const }, take: 1 },
    assignedCoder: { select: PERSON_SELECT },
    productionEntries: { where: { isCurrent: true }, select: { status: true } },
  } as const;

  private toListRow(chart: Prisma.ChartGetPayload<{ include: { importRows: true; assignedCoder: { select: typeof PERSON_SELECT }; productionEntries: { select: { status: true } } } }>) {
    const latest = chart.importRows[0];
    return {
      chartId: chart.chartId,
      pageCount: latest?.pageCount ?? null,
      pageBucket: latest?.pageBucket ?? null,
      textbox9: latest?.textbox9 ?? null,
      eventTypeName2: latest?.eventTypeName2 ?? null,
      highLevelStatus: latest?.highLevelStatus ?? null,
      assignedCoder: chart.assignedCoder ? personRef(chart.assignedCoder) : null,
      assignedAt: chart.assignedAt?.toISOString() ?? null,
      productionStatus: chart.productionEntries[0]?.status ?? null,
    };
  }

  async listAllocatable(caller: AuthUser, projectId: string, query: ListChartAllocationsDto): Promise<ChartAllocationListResponse> {
    await this.assertManagerManualProject(caller, projectId);
    const where = this.listWhere(projectId, query);
    const [rows, total] = await Promise.all([
      this.prisma.chart.findMany({
        where,
        include: this.LIST_INCLUDE,
        orderBy: { chartId: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.chart.count({ where }),
    ]);
    return { data: rows.map((r) => this.toListRow(r)), total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Manager Summary export (docs/09-BUSINESS-RULES.md section 12): the
   * client Raw columns from the latest applicable ChartImportRow per
   * Chart, "Assigned to" always blank, "Shift 1" always fixed. Raw source
   * data (ChartImportRow) is never modified by this - export is read-only.
   */
  async exportSummary(caller: AuthUser, projectId: string, query: ExportChartAllocationsDto): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
    await this.assertManagerManualProject(caller, projectId);
    const where = this.listWhere(projectId, query);
    const rows = await this.prisma.chart.findMany({
      where,
      include: { importRows: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { chartId: 'asc' },
      take: EXPORT_ROW_CAP,
    });
    const exportRows = rows.map((c) => {
      const latest = c.importRows[0];
      return {
        chartId: c.chartId,
        pageCount: latest?.pageCount ?? null,
        pageBucket: latest?.pageBucket ?? null,
        textbox9: latest?.textbox9 ?? null,
        eventTypeName2: latest?.eventTypeName2 ?? null,
        highLevelStatus: latest?.highLevelStatus ?? null,
      };
    });
    const fileType: ChartAllocationFileType = query.format === 'xlsx' ? 'XLSX' : 'CSV';
    const buffer = await buildAllocationSummaryFile(fileType, exportRows);
    await writeAuditLog(this.prisma, caller, 'CHART_ALLOCATION_EXPORTED', 'Project', projectId, {
      after: { projectId, format: query.format, rows: exportRows.length },
    });
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const ext = query.format === 'xlsx' ? 'xlsx' : 'csv';
    return {
      buffer,
      fileName: `smartcode-chart-allocation-summary-${stamp}.${ext}`,
      contentType: query.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8',
    };
  }

  // ─── Team Lead: Summary upload (preview / commit) ──────────────

  /**
   * Validates every ACTIONABLE row (non-blank "Assigned to" - see the
   * class-level interpretation note above). Mirrors
   * ChartImportsService.validateRows's exact shape/order (field errors ->
   * duplicate-within-file detection -> DB cross-checks), applied to this
   * phase's own rules instead:
   *   - ChartID must be present and belong to this Project (item 82).
   *   - Login Name must exist, belong to an ACTIVE Coder account, and that
   *     Coder must be on this Project's Team (items 78-80; "Team" is
   *     used as the Vendor/Team relationship check - a Coder's team
   *     membership already encodes which vendor cascade placed them
   *     there, per vendor-scope.ts).
   *   - A Chart already actively allocated to a DIFFERENT Coder is
   *     rejected (item 129) - the row must go through the explicit
   *     Reassign operation instead (item 130). Already allocated to the
   *     SAME Coder is a harmless no-op, not an error (item 85).
   */
  private async validateAllocationRows(
    projectId: string,
    projectTeamId: string | null,
    records: Record<string, string>[],
  ): Promise<{ actionable: ChartAllocationRowResult[] }> {
    const all: ChartAllocationRowResult[] = records.map((rec, i) => ({
      rowNumber: i + 2,
      status: 'valid' as ChartAllocationRowStatus,
      errors: [] as string[],
      chartId: (rec.ChartID ?? '').trim(),
      loginName: (rec['Assigned to'] ?? '').trim(),
    }));

    const actionable = all.filter((r) => r.loginName !== '');
    for (const r of actionable) {
      if (!r.chartId) r.errors.push('ChartID is required');
    }

    // Duplicate ChartID WITHIN this file - every row sharing it is
    // flagged, none are imported, same rule as the client chart importer.
    const byChartId = new Map<string, ChartAllocationRowResult[]>();
    for (const r of actionable) {
      if (!r.chartId) continue;
      const list = byChartId.get(r.chartId);
      if (list) list.push(r);
      else byChartId.set(r.chartId, [r]);
    }
    for (const [chartId, group] of byChartId) {
      if (group.length < 2) continue;
      for (const r of group) {
        r.status = 'duplicate';
        const others = group.filter((x) => x !== r).map((x) => x.rowNumber);
        r.errors.push(
          others.length === 1
            ? `Duplicate ChartID ${chartId} found in row ${others[0]}.`
            : `Duplicate ChartID ${chartId} also appears in rows ${others.join(', ')}.`,
        );
      }
    }

    const chartIds = [...new Set(actionable.map((r) => r.chartId).filter(Boolean))];
    const loginNames = [...new Set(actionable.map((r) => r.loginName).filter(Boolean))];

    const [charts, coders, activeAllocations] = await Promise.all([
      chartIds.length ? this.prisma.chart.findMany({ where: { chartId: { in: chartIds } }, select: { chartId: true, projectId: true } }) : [],
      loginNames.length
        ? this.prisma.user.findMany({ where: { loginName: { in: loginNames } }, select: { id: true, loginName: true, role: true, isActive: true, teamId: true } })
        : [],
      chartIds.length ? this.prisma.chartAllocation.findMany({ where: { chartId: { in: chartIds }, isActive: true }, select: { chartId: true, coderId: true } }) : [],
    ]);
    // Explicit Map<K, V> generics below: without them, a `.map(c => [c.x, c])`
    // callback returning an object (not a plain string) infers as a union
    // array rather than a tuple, and Map's key/value types collapse to `{}`
    // - silently losing all property access on `.get(...)` results.
    const chartByChartId = new Map<string, { chartId: string; projectId: string }>(
      charts.map((c: { chartId: string; projectId: string }) => [c.chartId, c]),
    );
    const coderByLoginName = new Map<string, { id: string; loginName: string; role: string; isActive: boolean; teamId: string | null }>(
      coders.map((u: { id: string; loginName: string; role: string; isActive: boolean; teamId: string | null }) => [u.loginName, u]),
    );
    const activeCoderByChartId = new Map<string, string>(activeAllocations.map((a: { chartId: string; coderId: string }) => [a.chartId, a.coderId]));

    for (const r of actionable) {
      if (!r.chartId) continue; // already flagged (missing ChartID)
      const promote = (msg: string) => {
        r.errors.push(msg);
        if (r.status === 'valid') r.status = 'invalid';
      };

      const chart = chartByChartId.get(r.chartId);
      if (!chart) {
        promote(`ChartID ${r.chartId} was not found`);
        continue;
      }
      if (chart.projectId !== projectId) {
        promote(`ChartID ${r.chartId} does not belong to this Project`);
        continue;
      }

      const coder = coderByLoginName.get(r.loginName);
      if (!coder) {
        promote(`Login Name "${r.loginName}" does not exist`);
        continue;
      }
      if (coder.role !== 'CODER') {
        promote(`Login Name "${r.loginName}" is not a Coder account`);
        continue;
      }
      if (!coder.isActive) {
        promote(`Login Name "${r.loginName}" belongs to an inactive account`);
        continue;
      }
      if (!projectTeamId || coder.teamId !== projectTeamId) {
        promote(`Login Name "${r.loginName}" is not on this Project's Team`);
        continue;
      }

      const activeCoderId = activeCoderByChartId.get(r.chartId);
      if (activeCoderId && activeCoderId !== coder.id) {
        promote(`ChartID ${r.chartId} is already actively allocated to another Coder - use Reassign instead`);
      }
      // activeCoderId === coder.id: already allocated to this same Coder - a harmless no-op (rule 85), not an error.
    }

    return { actionable };
  }

  private toPreviewResponse(fileName: string, fileType: ChartAllocationFileType, actionable: ChartAllocationRowResult[]): ChartAllocationPreviewResponse {
    return {
      fileName,
      fileType,
      totalRows: actionable.length,
      validRows: actionable.filter((r) => r.status === 'valid').length,
      invalidRows: actionable.filter((r) => r.status === 'invalid').length,
      duplicateRows: actionable.filter((r) => r.status === 'duplicate').length,
      rows: actionable,
    };
  }

  async previewAllocationUpload(caller: AuthUser, projectId: string, file: UploadedChartAllocationFile | undefined): Promise<ChartAllocationPreviewResponse> {
    const project = await this.assertTeamLeadManualProject(caller, projectId);
    const { fileName, fileType, headers, rows } = await readChartAllocationUpload(file);
    const records = toChartAllocationRecords(headers, rows);
    const { actionable } = await this.validateAllocationRows(projectId, project.teamId, records);

    await writeAuditLog(this.prisma, caller, 'CHART_ALLOCATION_PREVIEW', 'ChartAllocationImport', null, {
      after: { projectId, fileName, fileType, totalRows: actionable.length, validRows: actionable.filter((r) => r.status === 'valid').length },
    });

    return this.toPreviewResponse(fileName, fileType, actionable);
  }

  /**
   * Re-validates server-side (authoritative, not the preview - same rule
   * as the client chart importer), then commits every valid row's
   * ChartAllocation + refreshes Chart's current-assignment pointer, and
   * this ChartAllocationImport's own history row, together in ONE
   * transaction. All-or-nothing: any invalid/duplicate ACTIONABLE row
   * rejects the whole upload (items 76-77, 251) and nothing is written.
   */
  async commitAllocationUpload(caller: AuthUser, projectId: string, file: UploadedChartAllocationFile | undefined): Promise<ChartAllocationCommitResponse> {
    const project = await this.assertTeamLeadManualProject(caller, projectId);
    const { fileName, fileType, headers, rows } = await readChartAllocationUpload(file);
    const records = toChartAllocationRecords(headers, rows);
    const { actionable } = await this.validateAllocationRows(projectId, project.teamId, records);

    if (actionable.length === 0) {
      throw new BadRequestException('No rows have "Assigned to" filled in - nothing to allocate');
    }

    const totalRows = actionable.length;
    const validRows = actionable.filter((r) => r.status === 'valid');
    const invalidRows = actionable.filter((r) => r.status === 'invalid').length;
    const duplicateRows = actionable.filter((r) => r.status === 'duplicate').length;

    await writeAuditLog(this.prisma, caller, 'CHART_ALLOCATION_STARTED', 'ChartAllocationImport', null, {
      after: { projectId, fileName, fileType, totalRows, validRows: validRows.length },
    });

    const allValid = invalidRows === 0 && duplicateRows === 0;
    if (!allValid) {
      const rejected = await this.prisma.chartAllocationImport.create({
        data: {
          projectId,
          fileName,
          fileType,
          status: 'REJECTED',
          totalRows,
          validRows: validRows.length,
          invalidRows,
          duplicateRows,
          successRows: 0,
          failedRows: totalRows,
          importedById: caller.id,
          errorSummary: capErrorSummary(actionable),
        },
      });
      await writeAuditLog(this.prisma, caller, 'CHART_ALLOCATION_REJECTED', 'ChartAllocationImport', rejected.id, {
        after: { projectId, fileName, totalRows, invalidRows, duplicateRows },
      });
      throw new BadRequestException({
        message: 'The file contains invalid or duplicate rows. The entire allocation upload was rejected - correct these rows and re-upload.',
        id: rejected.id,
        fileName,
        status: 'REJECTED',
        totalRows,
        validRows: validRows.length,
        invalidRows,
        duplicateRows,
        rows: actionable,
      });
    }

    // Authoritative re-check right before the write (the preview is
    // advisory): resolve which valid rows are genuinely NEW allocations
    // vs a harmless re-upload of an unchanged assignment (rule 85).
    const chartIds = validRows.map((r) => r.chartId);
    const [currentActive, coders, teamRow, vendorId] = await Promise.all([
      this.prisma.chartAllocation.findMany({ where: { chartId: { in: chartIds }, isActive: true }, select: { chartId: true, coderId: true } }),
      this.prisma.user.findMany({ where: { loginName: { in: validRows.map((r) => r.loginName) } }, select: { id: true, loginName: true } }),
      project.teamId ? this.prisma.team.findUnique({ where: { id: project.teamId } }) : Promise.resolve(null),
      teamVendorId(this.prisma, project.teamId),
    ]);
    const activeCoderByChartId = new Map(currentActive.map((a: { chartId: string; coderId: string }) => [a.chartId, a.coderId]));
    const coderIdByLoginName = new Map(coders.map((u: { loginName: string; id: string }) => [u.loginName, u.id]));
    const teamLeadId = teamRow?.teamLeadId ?? null;

    const toAllocate = validRows.filter((r) => activeCoderByChartId.get(r.chartId) !== coderIdByLoginName.get(r.loginName));

    try {
      const importId = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const importRow = await tx.chartAllocationImport.create({
            data: { projectId, fileName, fileType, status: 'PENDING', totalRows, importedById: caller.id },
          });

          for (const r of toAllocate) {
            const coderId = coderIdByLoginName.get(r.loginName)!;
            const allocation = await tx.chartAllocation.create({
              data: {
                chartId: r.chartId,
                projectId,
                coderId,
                loginNameSnapshot: r.loginName,
                vendorId,
                teamId: project.teamId,
                teamLeadId,
                assignedById: caller.id,
                sourceImportId: importRow.id,
              },
            });
            await tx.chart.update({
              where: { chartId: r.chartId },
              data: { assignedCoderId: coderId, assignedById: caller.id, assignedAt: allocation.assignedAt },
            });
          }

          const successRows = validRows.length;
          await tx.chartAllocationImport.update({
            where: { id: importRow.id },
            data: {
              status: 'COMPLETED',
              validRows: validRows.length,
              invalidRows,
              duplicateRows,
              successRows,
              failedRows: totalRows - successRows,
              errorSummary: capErrorSummary(actionable),
            },
          });
          await writeAuditLog(tx, caller, 'CHART_ALLOCATION_COMPLETED', 'ChartAllocationImport', importRow.id, {
            after: { projectId, fileName, allocated: toAllocate.length, unchanged: validRows.length - toAllocate.length, totalRows },
          });
          return importRow.id;
        },
        { timeout: 120_000 },
      );

      const final = await this.prisma.chartAllocationImport.findUniqueOrThrow({ where: { id: importId } });
      return {
        id: final.id,
        fileName,
        status: final.status,
        totalRows,
        validRows: validRows.length,
        invalidRows,
        duplicateRows,
        successRows: final.successRows,
        failedRows: final.failedRows,
        rows: actionable,
      };
    } catch (e) {
      const failed = await this.prisma.chartAllocationImport.create({
        data: {
          projectId,
          fileName,
          fileType,
          status: 'FAILED',
          totalRows,
          validRows: validRows.length,
          invalidRows,
          duplicateRows,
          successRows: 0,
          failedRows: totalRows,
          importedById: caller.id,
          errorSummary: isUniqueViolation(e)
            ? ['A duplicate active allocation was created concurrently during commit - nothing was allocated. Preview again.']
            : ['Allocation transaction failed - nothing was allocated.'],
        },
      });
      await writeAuditLog(this.prisma, caller, 'CHART_ALLOCATION_FAILED', 'ChartAllocationImport', failed.id, {
        after: { projectId, fileName, reason: isUniqueViolation(e) ? 'duplicate detected during commit' : 'transaction failed' },
      });
      if (isUniqueViolation(e)) {
        throw new ConflictException('A duplicate active allocation was created concurrently during commit - nothing was allocated. Preview again.');
      }
      throw e;
    }
  }

  // ─── Pullback / Reassign ────────────────────────────────────────

  /**
   * Blocking rules (documented per this phase's explicit instruction to
   * disclose a gap rather than invent a new rule):
   *   - "Do not pull back completed production" (explicit instruction) -
   *     blocks when the chart's current ProductionEntry is COMPLETED.
   *   - A live Rework (OPEN/IN_PROGRESS/RESOLVED) blocks pullback - reused
   *     directly from the existing Rework state machine
   *     (rework.workflow.ts's own LIVE_REWORK semantics), not invented:
   *     pulling back mid-correction would orphan it.
   *   - Pullback while production is merely PENDING/IN_PROGRESS/REWORK
   *     (not yet completed, and with no live rework) is NOT blocked here -
   *     the given business rules only forbid pulling back COMPLETED work,
   *     and existing ProductionEntry state rules do not themselves forbid
   *     this case, so nothing further is invented. This is disclosed in
   *     the Phase 10D report as a known, intentionally undecided edge case
   *     rather than a silently-invented policy.
   */
  async pullback(caller: AuthUser, projectId: string, chartId: string, dto: PullbackChartAllocationInput): Promise<{ chartId: string; allocated: boolean }> {
    await this.assertManagerOrOwnTeamLeadProject(caller, projectId);
    const chart = await this.prisma.chart.findFirst({ where: { chartId, projectId } });
    if (!chart) throw new NotFoundException('Chart not found in this Project');
    const active = await this.prisma.chartAllocation.findFirst({ where: { chartId, isActive: true } });
    if (!active) throw new ConflictException('This chart is not currently allocated');

    const currentProduction = await this.prisma.productionEntry.findFirst({ where: { chartId, isCurrent: true } });
    if (currentProduction?.status === 'COMPLETED') {
      throw new ConflictException('Completed production cannot be pulled back - this Coder has already finished this chart');
    }
    const liveRework = await this.prisma.rework.findFirst({ where: { chartId, status: { in: [...LIVE_REWORK_STATUSES] } } });
    if (liveRework) {
      throw new ConflictException('This chart has a live rework in progress and cannot be pulled back until it is resolved, withdrawn or reaudited');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.chartAllocation.update({
        where: { id: active.id },
        data: { isActive: false, endedAt: new Date(), endedById: caller.id, endReason: 'PULLED_BACK', endNote: dto.reason?.trim() || null },
      });
      await tx.chart.update({ where: { chartId }, data: { assignedCoderId: null, assignedById: null, assignedAt: null } });
      await writeAuditLog(tx, caller, 'CHART_ALLOCATION_PULLED_BACK', 'ChartAllocation', active.id, {
        before: { coderId: active.coderId, loginName: active.loginNameSnapshot },
        after: { chartId, reason: dto.reason ?? null },
      });
    });
    return { chartId, allocated: false };
  }

  /** Ends the current allocation and creates a new one atomically, validating the new Coder BEFORE changing anything (item "Validate new coder before changing anything"). */
  async reassign(caller: AuthUser, projectId: string, chartId: string, dto: ReassignChartAllocationInput): Promise<{ chartId: string; allocationId: string }> {
    const project = await this.assertManagerOrOwnTeamLeadProject(caller, projectId);
    const chart = await this.prisma.chart.findFirst({ where: { chartId, projectId } });
    if (!chart) throw new NotFoundException('Chart not found in this Project');
    const active = await this.prisma.chartAllocation.findFirst({ where: { chartId, isActive: true } });
    if (!active) throw new ConflictException('This chart has no active allocation to reassign - allocate it first via a Summary upload');

    const loginName = dto.loginName.trim();
    const coder = await this.prisma.user.findUnique({ where: { loginName } });
    if (!coder) throw new BadRequestException(`Login Name "${loginName}" does not exist`);
    if (coder.role !== 'CODER') throw new BadRequestException(`Login Name "${loginName}" is not a Coder account`);
    if (!coder.isActive) throw new BadRequestException(`Login Name "${loginName}" belongs to an inactive account`);
    if (!project.teamId || coder.teamId !== project.teamId) throw new BadRequestException(`Login Name "${loginName}" is not on this Project's Team`);
    if (coder.id === active.coderId) throw new ConflictException('This chart is already allocated to that Coder');

    const [vendorId, teamRow] = await Promise.all([
      teamVendorId(this.prisma, project.teamId),
      project.teamId ? this.prisma.team.findUnique({ where: { id: project.teamId } }) : Promise.resolve(null),
    ]);

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.chartAllocation.update({
        where: { id: active.id },
        data: { isActive: false, endedAt: new Date(), endedById: caller.id, endReason: 'REASSIGNED' },
      });
      const next = await tx.chartAllocation.create({
        data: {
          chartId,
          projectId,
          coderId: coder.id,
          loginNameSnapshot: loginName,
          vendorId,
          teamId: project.teamId,
          teamLeadId: teamRow?.teamLeadId ?? null,
          assignedById: caller.id,
          previousAllocationId: active.id,
        },
      });
      await tx.chart.update({ where: { chartId }, data: { assignedCoderId: coder.id, assignedById: caller.id, assignedAt: next.assignedAt } });
      await writeAuditLog(tx, caller, 'CHART_REASSIGNED', 'ChartAllocation', next.id, {
        before: { coderId: active.coderId, loginName: active.loginNameSnapshot },
        after: { coderId: coder.id, loginName },
      });
      return next;
    });
    return { chartId, allocationId: created.id };
  }

  // ─── History / metrics ──────────────────────────────────────────

  async listHistory(caller: AuthUser, projectId: string, query: ListChartAllocationHistoryDto): Promise<ChartAllocationHistoryListResponse> {
    await this.assertManagerOrOwnTeamLeadProject(caller, projectId);
    const where: Prisma.ChartAllocationWhereInput = {
      projectId,
      ...(query.search?.trim() ? { chartId: { contains: query.search.trim(), mode: 'insensitive' } } : {}),
    };
    const include = {
      coder: { select: PERSON_SELECT },
      team: { select: { id: true, name: true } },
      teamLead: { select: PERSON_SELECT },
      assignedBy: { select: PERSON_SELECT },
      endedBy: { select: PERSON_SELECT },
    } as const;
    const [rows, total] = await Promise.all([
      this.prisma.chartAllocation.findMany({
        where,
        include,
        orderBy: { assignedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.chartAllocation.count({ where }),
    ]);
    const data: ChartAllocationHistoryRow[] = rows.map((r) => ({
      id: r.id,
      chartId: r.chartId,
      projectId: r.projectId,
      coder: personRef(r.coder),
      loginNameSnapshot: r.loginNameSnapshot,
      team: r.team ? { id: r.team.id, name: r.team.name } : null,
      teamLead: r.teamLead ? personRef(r.teamLead) : null,
      assignedBy: r.assignedBy ? personRef(r.assignedBy) : null,
      assignedAt: r.assignedAt.toISOString(),
      isActive: r.isActive,
      endedAt: r.endedAt?.toISOString() ?? null,
      endedBy: r.endedBy ? personRef(r.endedBy) : null,
      endReason: r.endReason,
      endNote: r.endNote,
      previousAllocationId: r.previousAllocationId,
    }));
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async listImportHistory(caller: AuthUser, projectId: string, query: ListChartAllocationHistoryDto): Promise<{ data: ChartAllocationImportHistoryRow[]; total: number; page: number; pageSize: number }> {
    await this.assertManagerOrOwnTeamLeadProject(caller, projectId);
    const where: Prisma.ChartAllocationImportWhereInput = {
      projectId,
      ...(query.search?.trim() ? { fileName: { contains: query.search.trim(), mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.chartAllocationImport.findMany({
        where,
        include: { importedBy: { select: PERSON_SELECT } },
        orderBy: { importedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.chartAllocationImport.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      fileType: r.fileType,
      status: r.status,
      totalRows: r.totalRows,
      validRows: r.validRows,
      invalidRows: r.invalidRows,
      duplicateRows: r.duplicateRows,
      successRows: r.successRows,
      failedRows: r.failedRows,
      importedAt: r.importedAt.toISOString(),
      importedBy: r.importedBy ? personRef(r.importedBy) : null,
    }));
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Raw counts only (docs/09-BUSINESS-RULES.md section 12 explicitly
   * forbids inventing a production-percentage formula): allocated/done/
   * pending from actual database state, overall and per-Coder - feeds
   * both the Manager and Team Lead dashboards.
   */
  async metrics(caller: AuthUser, projectId: string): Promise<ChartAllocationMetrics> {
    await this.assertManagerOrOwnTeamLeadProject(caller, projectId);
    const activeAllocations = await this.prisma.chartAllocation.findMany({
      where: { projectId, isActive: true },
      select: { chartId: true, coderId: true, coder: { select: PERSON_SELECT } },
    });
    const chartIds = activeAllocations.map((a) => a.chartId);
    const currentProduction = chartIds.length
      ? await this.prisma.productionEntry.findMany({ where: { chartId: { in: chartIds }, isCurrent: true }, select: { chartId: true, status: true } })
      : [];
    const statusByChartId = new Map(currentProduction.map((p: { chartId: string; status: string }) => [p.chartId, p.status]));

    const byCoderMap = new Map<string, { coder: ReturnType<typeof personRef>; allocated: number; done: number; pending: number }>();
    let done = 0;
    for (const a of activeAllocations) {
      const isDone = statusByChartId.get(a.chartId) === 'COMPLETED';
      if (isDone) done += 1;
      const entry = byCoderMap.get(a.coderId) ?? { coder: personRef(a.coder), allocated: 0, done: 0, pending: 0 };
      entry.allocated += 1;
      if (isDone) entry.done += 1;
      else entry.pending += 1;
      byCoderMap.set(a.coderId, entry);
    }
    return {
      allocated: activeAllocations.length,
      done,
      pending: activeAllocations.length - done,
      byCoder: [...byCoderMap.values()],
    };
  }
}
