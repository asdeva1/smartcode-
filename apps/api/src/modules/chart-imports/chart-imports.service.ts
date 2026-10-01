import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AuthUser,
  ChartImportCommitResponse,
  ChartImportHistoryDetail,
  ChartImportHistoryListResponse,
  ChartImportHistoryRow,
  ChartImportPreviewResponse,
  ChartImportRowResult,
  ChartImportRowStatus,
} from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { writeAuditLog } from '../../common/audit-log';
import { PERSON_SELECT, isUniqueViolation, personRef } from '../../common/scope';
import { readChartImportUpload, toChartImportRecords, type UploadedChartImportFile } from '../../common/chart-import/chart-import-upload';
import { ListChartImportsDto } from './dto/list-chart-imports.dto';

const HISTORY_INCLUDE = {
  importedBy: { select: PERSON_SELECT },
  templateVersion: { select: { id: true, version: true } },
} as const;

type HistoryRow = Prisma.ChartImportGetPayload<{ include: typeof HISTORY_INCLUDE }>;

function toHistoryDto(row: HistoryRow): ChartImportHistoryRow {
  return {
    id: row.id,
    fileName: row.fileName,
    fileType: row.fileType,
    status: row.status,
    totalRows: row.totalRows,
    validRows: row.validRows,
    invalidRows: row.invalidRows,
    duplicateRows: row.duplicateRows,
    successRows: row.successRows,
    failedRows: row.failedRows,
    importedAt: row.importedAt.toISOString(),
    importedBy: row.importedBy ? personRef(row.importedBy) : null,
    templateVersion: row.templateVersion ? { id: row.templateVersion.id, version: row.templateVersion.version } : null,
  };
}

function capErrorSummary(results: ChartImportRowResult[]): string[] | undefined {
  const messages = results.filter((r) => r.status !== 'valid').flatMap((r) => r.errors.map((e) => `Row ${r.rowNumber}: ${e}`));
  return messages.length ? messages.slice(0, 200) : undefined;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Phase 10A-10B — Client File Driven Chart Import Foundation
 * (docs/09-BUSINESS-RULES.md section 11). Manager-only: imports the
 * client's "Raw" sheet/CSV into real Chart rows for a MANUAL-allocation
 * Project. Deliberately does NOT implement the Team-Lead Summary-upload/
 * "Assigned to" workflow (Phase 10D) or the Manager Allocation Summary
 * export (Phase 10C) - both are explicitly out of scope here.
 */
@Injectable()
export class ChartImportsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertManager(caller: AuthUser) {
    if (caller.role !== 'MANAGER') throw new ForbiddenException('Only a Manager can import client chart files');
  }

  private async assertManagerProject(caller: AuthUser, projectId: string) {
    this.assertManager(caller);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  /**
   * Client chart import (preview/commit) is a MANUAL-allocation-only
   * workflow (docs/09-BUSINESS-RULES.md section 11): an AUTOMATIC project
   * has no client allocation file at all - the Manager selects a Team and
   * the Coder enters ChartID + PageCount directly in the Production
   * Workspace. This is enforced here, server-side, so the frontend cannot
   * be relied on (or bypassed) to keep an AUTOMATIC project's chart
   * inventory out of this file-upload path. Only preview()/commit() use
   * this - listHistory()/getHistoryDetail() intentionally still use the
   * unrestricted assertManagerProject, since viewing past import history
   * is not itself a write and is not scoped to allocation type.
   */
  private async assertManagerManualProject(caller: AuthUser, projectId: string) {
    const project = await this.assertManagerProject(caller, projectId);
    if (project.allocationType !== 'MANUAL') {
      throw new BadRequestException('Client chart import is available only for MANUAL allocation projects.');
    }
    return project;
  }

  /**
   * Validates every row (required ChartID, required whole-number
   * PageCount; PageBucket/textbox9/EventTypeName2/High_Level_Status are
   * passed through verbatim, never interpreted).
   *
   * Duplicate ChartID WITHIN the same file (CORRECTED per architecture
   * review): EVERY row sharing that ChartID is flagged 'duplicate' -
   * never just the later occurrence(s) - and NONE of them are imported.
   * There is no business rule authorizing SmartCode to pick one occurrence
   * as correct when duplicate rows disagree (e.g. different PageCount), so
   * it picks none; the Manager must correct the file and re-upload.
   *
   * A ChartID that already exists under a DIFFERENT project is flagged
   * invalid. A ChartID that already exists under THIS SAME project is left
   * 'valid' - at commit time this appends a new ChartImportRow (the
   * source-of-truth for its attribute values) and only refreshes the
   * existing Chart's `sourceImportId` pointer, never overwriting or
   * destroying that Chart's ProductionEntry/AuditEntry/Rework history, and
   * never touching a prior import's ChartImportRow values (see
   * docs/09-BUSINESS-RULES.md section 11).
   */
  private async validateRows(
    projectId: string,
    records: Record<string, string>[],
  ): Promise<{ results: ChartImportRowResult[]; existingInProjectRows: number }> {
    const results: ChartImportRowResult[] = records.map((rec, i) => {
      const rowNumber = i + 2; // header is row 1
      const errors: string[] = [];
      const chartId = (rec.ChartID ?? '').trim();
      const pageCountRaw = (rec.PageCount ?? '').trim();
      if (!chartId) errors.push('ChartID is required');
      if (!pageCountRaw) {
        errors.push('PageCount is required');
      } else if (!/^\d+$/.test(pageCountRaw)) {
        errors.push('PageCount must be a valid whole number');
      }
      const status: ChartImportRowStatus = errors.length ? 'invalid' : 'valid';
      return { rowNumber, status, errors, data: { ...rec } };
    });

    // Duplicate ChartID within this file: group every row by ChartID, and
    // whenever a ChartID appears more than once, mark EVERY row sharing it
    // 'duplicate' (not just the later ones), each naming every other row
    // it conflicts with so the Manager can locate and fix all of them.
    const rowsByChartId = new Map<string, ChartImportRowResult[]>();
    for (const r of results) {
      const chartId = (r.data.ChartID ?? '').trim();
      if (!chartId) continue;
      const list = rowsByChartId.get(chartId);
      if (list) list.push(r);
      else rowsByChartId.set(chartId, [r]);
    }
    for (const [chartId, group] of rowsByChartId) {
      if (group.length < 2) continue;
      for (const r of group) {
        r.status = 'duplicate';
        const otherRows = group.filter((x) => x !== r).map((x) => x.rowNumber);
        r.errors.push(
          otherRows.length === 1
            ? `Duplicate ChartID ${chartId} found in row ${otherRows[0]}.`
            : `Duplicate ChartID ${chartId} also appears in rows ${otherRows.join(', ')}.`,
        );
      }
    }

    const chartIds = [...new Set(results.map((r) => (r.data.ChartID ?? '').trim()).filter(Boolean))];
    const existing = chartIds.length
      ? await this.prisma.chart.findMany({ where: { chartId: { in: chartIds } }, select: { chartId: true, projectId: true } })
      : [];
    const existingByChartId = new Map(existing.map((c: { chartId: string; projectId: string }) => [c.chartId, c.projectId]));

    let existingInProjectRows = 0;
    for (const r of results) {
      const chartId = (r.data.ChartID ?? '').trim();
      if (!chartId) continue;
      const existingProjectId = existingByChartId.get(chartId);
      if (existingProjectId === undefined) continue;
      if (existingProjectId === projectId) {
        if (r.status === 'valid') existingInProjectRows += 1;
      } else {
        // A cross-project conflict is always noted, but only PROMOTES a
        // still-'valid' row to 'invalid' - a row already 'duplicate' (a
        // same-file conflict) stays 'duplicate', since that is already a
        // rejection status and the two problems are independently true.
        if (r.status === 'valid') r.status = 'invalid';
        r.errors.push(`ChartID ${chartId} already exists under a different project and cannot be re-imported here`);
      }
    }
    return { results, existingInProjectRows };
  }

  /**
   * Corrected Project -> Template -> TemplateVersion lineage (architecture
   * review): ChartImportTemplate is now its own row, one per Project,
   * created lazily here on first use; ChartImportTemplateVersion belongs
   * to it (not directly to Project). A new version is only created when
   * this Project's imported header set differs from its current active
   * version.
   */
  private async getOrCreateTemplateVersion(tx: Prisma.TransactionClient, caller: AuthUser, projectId: string, headers: string[]) {
    let template = await tx.chartImportTemplate.findUnique({ where: { projectId } });
    if (!template) {
      template = await tx.chartImportTemplate.create({ data: { projectId } });
    }
    const active = await tx.chartImportTemplateVersion.findFirst({ where: { templateId: template.id, isActive: true }, orderBy: { version: 'desc' } });
    if (active && arraysEqual(active.headers, headers)) return active;
    if (active) {
      await tx.chartImportTemplateVersion.update({ where: { id: active.id }, data: { isActive: false } });
    }
    const latest = await tx.chartImportTemplateVersion.aggregate({ where: { templateId: template.id }, _max: { version: true } });
    return tx.chartImportTemplateVersion.create({
      data: { templateId: template.id, version: (latest._max.version ?? 0) + 1, headers, isActive: true, createdById: caller.id },
    });
  }

  async preview(caller: AuthUser, projectId: string, file: UploadedChartImportFile | undefined): Promise<ChartImportPreviewResponse> {
    await this.assertManagerManualProject(caller, projectId);
    const { fileName, fileType, headers, rows } = await readChartImportUpload(file);
    const records = toChartImportRecords(headers, rows);
    const { results, existingInProjectRows } = await this.validateRows(projectId, records);

    await writeAuditLog(this.prisma, caller, 'CLIENT_CHART_IMPORT_PREVIEW', 'ChartImport', null, {
      after: { projectId, fileName, fileType, totalRows: results.length, validRows: results.filter((r) => r.status === 'valid').length },
    });

    return {
      fileName,
      fileType,
      totalRows: results.length,
      validRows: results.filter((r) => r.status === 'valid').length,
      invalidRows: results.filter((r) => r.status === 'invalid').length,
      duplicateRows: results.filter((r) => r.status === 'duplicate').length,
      existingInProjectRows,
      rows: results,
    };
  }

  /**
   * Re-validates server-side (the preview is advisory, the commit is
   * authoritative - same rule as the Coder CSV importer), then writes
   * every valid row's Chart (insert new / refresh provenance pointer on
   * existing), a fresh ChartImportRow per valid row (never updated in
   * place - see docs/09-BUSINESS-RULES.md section 11), and this
   * ChartImport's own history row together, in ONE transaction: either the
   * whole import succeeds or none of it is written. Never reports
   * COMPLETED unless every write in this batch actually happened.
   */
  async commit(caller: AuthUser, projectId: string, file: UploadedChartImportFile | undefined): Promise<ChartImportCommitResponse> {
    await this.assertManagerManualProject(caller, projectId);
    const { fileName, fileType, headers, rows } = await readChartImportUpload(file);
    const records = toChartImportRecords(headers, rows);
    const { results } = await this.validateRows(projectId, records);

    const totalRows = results.length;
    const validRows = results.filter((r) => r.status === 'valid');
    const invalidRows = results.filter((r) => r.status === 'invalid').length;
    const duplicateRows = results.filter((r) => r.status === 'duplicate').length;

    await writeAuditLog(this.prisma, caller, 'CLIENT_CHART_IMPORT_STARTED', 'ChartImport', null, {
      after: { projectId, fileName, fileType, totalRows, validRows: validRows.length },
    });

    // CORRECTED (final round): the whole file is rejected as soon as ANY
    // row is invalid or duplicate - not only when there are zero valid
    // rows. A client chart inventory file is a single authoritative unit;
    // there is no business rule that authorizes SmartCode to import "most
    // of it" while silently discarding the rest. The write transaction
    // below (Chart create/update, ChartImportRow inserts, ChartImport
    // COMPLETED) is therefore only ever entered when every row in the file
    // validated successfully.
    const allValid = invalidRows === 0 && duplicateRows === 0;
    if (!allValid) {
      const rejected = await this.prisma.chartImport.create({
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
          errorSummary: capErrorSummary(results),
        },
      });
      const reason = validRows.length === 0 ? 'no valid rows' : 'one or more rows are invalid or duplicate';
      await writeAuditLog(this.prisma, caller, 'CLIENT_CHART_IMPORT_REJECTED', 'ChartImport', rejected.id, {
        after: { projectId, fileName, reason, totalRows, invalidRows, duplicateRows },
      });
      throw new BadRequestException({
        message:
          validRows.length === 0
            ? 'No valid rows to import'
            : 'The file contains invalid or duplicate rows. The entire import was rejected - correct these rows and re-upload.',
        id: rejected.id,
        fileName,
        status: 'REJECTED',
        totalRows,
        validRows: validRows.length,
        invalidRows,
        duplicateRows,
        rows: results,
      });
    }

    const existingInProject = await this.prisma.chart.findMany({
      where: { projectId, chartId: { in: validRows.map((r) => r.data.ChartID.trim()) } },
      select: { chartId: true },
    });
    const existingSet = new Set(existingInProject.map((c: { chartId: string }) => c.chartId));
    const toCreate = validRows.filter((r) => !existingSet.has(r.data.ChartID.trim()));
    const toUpdate = validRows.filter((r) => existingSet.has(r.data.ChartID.trim()));

    try {
      const importId = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const templateVersion = await this.getOrCreateTemplateVersion(tx, caller, projectId, headers);
          const importRow = await tx.chartImport.create({
            data: { projectId, fileName, fileType, status: 'PENDING', totalRows, importedById: caller.id, templateVersionId: templateVersion.id },
          });

          const BATCH = 500;

          // 1) Brand-new Charts - base identity fields only. Client
          // attribute values are never stored on Chart itself; they are
          // written to ChartImportRow below, which is this data's actual
          // source of truth.
          for (let i = 0; i < toCreate.length; i += BATCH) {
            const batch = toCreate.slice(i, i + BATCH);
            await tx.chart.createMany({
              data: batch.map((r) => ({
                chartId: r.data.ChartID.trim(),
                projectId,
                sourceImportId: importRow.id,
              })),
            });
          }

          // 2) Already-existing-in-this-project Charts - refresh ONLY the
          // lightweight provenance pointer. This NEVER touches
          // ProductionEntry/AuditEntry/Rework, and NEVER overwrites a
          // prior import's attribute values (those are immutable
          // ChartImportRow rows, never updated in place).
          for (const r of toUpdate) {
            await tx.chart.update({
              where: { chartId: r.data.ChartID.trim() },
              data: { sourceImportId: importRow.id },
            });
          }

          // 3) ChartImportRow - one fresh INSERT per valid row (both newly
          // created and already-existing Charts), preserving full
          // historical source data across any number of repeated imports
          // of the same ChartID.
          for (let i = 0; i < validRows.length; i += BATCH) {
            const batch = validRows.slice(i, i + BATCH);
            await tx.chartImportRow.createMany({
              data: batch.map((r) => ({
                chartImportId: importRow.id,
                templateVersionId: templateVersion.id,
                chartId: r.data.ChartID.trim(),
                rowNumber: r.rowNumber,
                pageCount: Number(r.data.PageCount.trim()),
                pageBucket: r.data.PageBucket || null,
                textbox9: r.data.textbox9 || null,
                eventTypeName2: r.data.EventTypeName2 || null,
                highLevelStatus: r.data.High_Level_Status || null,
              })),
            });
          }

          const successRows = toCreate.length + toUpdate.length;
          await tx.chartImport.update({
            where: { id: importRow.id },
            data: {
              status: 'COMPLETED',
              validRows: validRows.length,
              invalidRows,
              duplicateRows,
              successRows,
              failedRows: totalRows - successRows,
              errorSummary: capErrorSummary(results),
            },
          });
          await writeAuditLog(tx, caller, 'CLIENT_CHART_IMPORT_COMPLETED', 'ChartImport', importRow.id, {
            after: { projectId, fileName, created: toCreate.length, updated: toUpdate.length, totalRows },
          });
          return importRow.id;
        },
        { timeout: 120_000 },
      );

      const final = await this.prisma.chartImport.findUniqueOrThrow({ where: { id: importId } });
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
        created: toCreate.length,
        updated: toUpdate.length,
        rows: results,
      };
    } catch (e) {
      const failed = await this.prisma.chartImport.create({
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
            ? ['A duplicate ChartID was created concurrently during commit - nothing was imported. Preview again.']
            : ['Import transaction failed - nothing was imported.'],
        },
      });
      await writeAuditLog(this.prisma, caller, 'CLIENT_CHART_IMPORT_FAILED', 'ChartImport', failed.id, {
        after: { projectId, fileName, reason: isUniqueViolation(e) ? 'duplicate detected during commit' : 'transaction failed' },
      });
      if (isUniqueViolation(e)) {
        throw new ConflictException('A duplicate ChartID was created concurrently during commit - nothing was imported. Preview again.');
      }
      throw e;
    }
  }

  async listHistory(caller: AuthUser, projectId: string, query: ListChartImportsDto): Promise<ChartImportHistoryListResponse> {
    await this.assertManagerProject(caller, projectId);
    const where: Prisma.ChartImportWhereInput = {
      projectId,
      ...(query.search?.trim() ? { fileName: { contains: query.search.trim(), mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.chartImport.findMany({
        where,
        include: HISTORY_INCLUDE,
        orderBy: { importedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.chartImport.count({ where }),
    ]);
    return { data: rows.map(toHistoryDto), total, page: query.page, pageSize: query.pageSize };
  }

  async getHistoryDetail(caller: AuthUser, projectId: string, id: string): Promise<ChartImportHistoryDetail> {
    await this.assertManagerProject(caller, projectId);
    const row = await this.prisma.chartImport.findFirst({ where: { id, projectId }, include: HISTORY_INCLUDE });
    if (!row) throw new NotFoundException('Import not found');
    return { ...toHistoryDto(row), errorSummary: (row.errorSummary as string[] | null) ?? null };
  }
}
