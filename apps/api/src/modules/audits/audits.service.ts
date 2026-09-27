import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AUDIT_IMPORT_HEADERS,
  AUDIT_TRANSITIONS,
  calculateTotalErrors,
  isNotFutureDate,
  isValidIsoDate,
  type AuditStatus,
  type AuthUser,
  type ExportFormat,
  type ImportCommitResponse,
  type ImportPreviewResponse,
  type ImportRowResult,
} from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from '../../common/export/export.service';
import { readCsvUpload, toRecords, type UploadedCsvFile } from '../../common/csv/csv-upload';
import { writeAuditLog, type AuditLogWriter } from '../../common/audit-log';
import {
  PERSON_SELECT,
  PROJECT_SELECT,
  auditScope,
  dateRange,
  isoDay,
  personRef,
  projectRef,
  requireTeam,
  toDate,
} from '../../common/scope';
import { summarize } from '../users/coders.service';
import { AUDIT_EXPORT_COLUMNS, AUDIT_INCLUDE, auditExportRow, toAuditDto } from './audit.mapper';
import {
  AuditQueueDto,
  CreateAuditDto,
  ListAuditsDto,
  ReauditDto,
  ResolveAuditDto,
  UpdateAuditDto,
} from './dto/audit.dto';

const OPEN: AuditStatus[] = ['PENDING', 'IN_PROGRESS'];
const EDITABLE: AuditStatus[] = ['PENDING', 'IN_PROGRESS'];

type Auditability =
  | { ok: true; chart: { chartId: string; projectId: string }; production: { id: string; version: number } }
  | { ok: false; kind: 'notfound' | 'invalid' | 'duplicate'; message: string };

/** Status-specific compliance events, in addition to the generic created/updated event. */
function statusEvent(status: string, reaudit = false): string | null {
  if (status === 'COMPLETED') return reaudit ? 'REAUDIT_COMPLETED' : 'AUDIT_COMPLETED';
  if (status === 'REVIEW_REQUIRED') return 'AUDIT_REVIEW_REQUIRED';
  if (status === 'REJECTED') return 'AUDIT_REJECTED';
  return null;
}

/**
 * Audit workflow per docs/09-BUSINESS-RULES.md: the Auditor supplies only
 * a Chart ID and audit fields; the backend resolves the chart's current
 * production version, recomputes Total Errors, and never writes to
 * production. COMPLETED audits are immutable; re-audit adds a new row.
 */
@Injectable()
export class AuditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: ExportService,
  ) {}

  // ─── scope helpers ───────────────────────────────────────────

  /** Chart visible to the caller for audit purposes; 404 (never 403) outside scope. */
  private async chartForCaller(caller: AuthUser, chartId: string) {
    const chart = await this.prisma.chart.findUnique({ where: { chartId }, include: { project: { select: PROJECT_SELECT } } });
    if (!chart) return null;
    if (caller.role === 'MANAGER') return chart;
    if (caller.role === 'TEAM_LEAD') return chart.project.teamId === requireTeam(caller) ? chart : null;
    if (caller.role === 'AUDITOR') {
      const assigned = await this.prisma.auditorProjectAssignment.findUnique({
        where: { auditorId_projectId: { auditorId: caller.id, projectId: chart.projectId } },
      });
      return assigned ? chart : null;
    }
    return null;
  }

  /** Can a brand-new audit be created for this chart's current version? Shared by create, lookup and CSV import. */
  private async checkAuditable(caller: AuthUser, chartId: string): Promise<Auditability> {
    const chart = await this.chartForCaller(caller, chartId);
    if (!chart) return { ok: false, kind: 'notfound', message: `Chart ${chartId} was not found in your assigned projects` };
    const production = await this.prisma.productionEntry.findFirst({
      where: { chartId, isCurrent: true },
      include: { auditEntries: { select: { id: true, status: true }, orderBy: { createdAt: 'desc' } } },
    });
    if (!production) return { ok: false, kind: 'invalid', message: `Chart ${chartId} has no production entry yet` };
    if (production.status !== 'COMPLETED') {
      return { ok: false, kind: 'invalid', message: `Production for chart ${chartId} is ${production.status}; only COMPLETED production can be audited` };
    }
    if (production.auditEntries.length > 0) {
      const latest = production.auditEntries[0];
      return {
        ok: false,
        kind: 'duplicate',
        message:
          latest.status === 'REJECTED'
            ? `Chart ${chartId} version ${production.version} was REJECTED - use re-audit or wait for rework`
            : `Chart ${chartId} version ${production.version} already has an audit (${latest.status})`,
      };
    }
    return { ok: true, chart: { chartId, projectId: chart.projectId }, production: { id: production.id, version: production.version } };
  }

  private assertTotal(auditErrors: number, errorExceptions: number, clientTotal?: number) {
    const total = calculateTotalErrors(auditErrors, errorExceptions);
    if (clientTotal !== undefined && clientTotal !== total) {
      throw new BadRequestException(`totalErrors (${clientTotal}) does not equal Audit Errors + Error Exceptions (${total})`);
    }
    return total;
  }

  /**
   * Row lock on the production version so two auditors can't both create
   * the "first" audit for it concurrently. SELECT ... FOR UPDATE only -
   * the production row itself is never modified by the audit workflow.
   */
  private lockProduction(tx: Prisma.TransactionClient, productionEntryId: string) {
    return tx.$queryRaw`SELECT id FROM "ProductionEntry" WHERE id = ${productionEntryId} FOR UPDATE`;
  }

  private async logStatus(db: AuditLogWriter, caller: AuthUser, id: string, status: string, chartId: string, reaudit = false) {
    const event = statusEvent(status, reaudit);
    if (event) await writeAuditLog(db, caller, event, 'AuditEntry', id, { after: { chartId, status } });
  }

  // ─── lookup / queue ──────────────────────────────────────────

  /** What the Auditor sees after entering a Chart ID - production is read-only here. */
  async lookup(caller: AuthUser, chartId: string) {
    const chart = await this.chartForCaller(caller, chartId);
    if (!chart) throw new NotFoundException(`Chart ${chartId} was not found in your assigned projects`);
    const production = await this.prisma.productionEntry.findFirst({
      where: { chartId, isCurrent: true },
      include: { coder: { select: PERSON_SELECT } },
    });
    if (!production) throw new NotFoundException(`Chart ${chartId} has no production entry yet`);
    const audits = await this.prisma.auditEntry.findMany({
      where: { productionEntryId: production.id },
      include: AUDIT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const check = await this.checkAuditable(caller, chartId);
    const latest = audits[0];
    const openMine = audits.find((a) => a.auditorId === caller.id && OPEN.includes(a.status as AuditStatus));
    return {
      chartId,
      project: projectRef(chart.project),
      production: {
        id: production.id,
        version: production.version,
        pageCount: production.pageCount,
        totalDOS: production.totalDOS,
        totalICDs: production.totalICDs,
        codedDate: isoDay(production.codedDate),
        status: production.status,
        coder: personRef(production.coder),
      },
      audits: audits.map(toAuditDto),
      canAudit: caller.role === 'AUDITOR' && check.ok,
      reason: check.ok ? null : check.message,
      openAuditId: openMine?.id ?? null,
      reauditTargetId: latest?.status === 'REJECTED' && production.status === 'COMPLETED' ? latest.id : null,
    };
  }

  private queueWhere(caller: AuthUser, q: Partial<AuditQueueDto>): Prisma.ProductionEntryWhereInput {
    if (caller.role !== 'AUDITOR') throw new ForbiddenException('Only an Auditor has an audit queue');
    const pending: Prisma.ProductionEntryWhereInput = { auditEntries: { none: {} } };
    const mine: Prisma.ProductionEntryWhereInput = { auditEntries: { some: { auditorId: caller.id, status: { in: OPEN } } } };
    const where: Prisma.ProductionEntryWhereInput = {
      isCurrent: true,
      status: 'COMPLETED',
      chart: {
        project: { auditorAssignments: { some: { auditorId: caller.id } } },
        ...(q.projectId ? { projectId: q.projectId } : {}),
      },
      ...(q.state === 'pending' ? pending : q.state === 'in_progress' ? mine : { OR: [pending, mine] }),
    };
    const search = q.search?.trim();
    if (search) where.chartId = { contains: search, mode: 'insensitive' };
    return where;
  }

  private queueInclude(caller: AuthUser) {
    return {
      coder: { select: PERSON_SELECT },
      chart: { select: { project: { select: PROJECT_SELECT } } },
      auditEntries: { where: { auditorId: caller.id, status: { in: OPEN } }, select: { id: true }, take: 1 },
    } as const;
  }

  private toQueueItem(p: Prisma.ProductionEntryGetPayload<{ include: ReturnType<AuditsService['queueInclude']> }>) {
    const mine = p.auditEntries[0];
    return {
      chartId: p.chartId,
      project: projectRef(p.chart.project),
      version: p.version,
      pageCount: p.pageCount,
      totalDOS: p.totalDOS,
      totalICDs: p.totalICDs,
      codedDate: isoDay(p.codedDate),
      productionStatus: p.status,
      coder: personRef(p.coder),
      queueState: mine ? ('IN_PROGRESS' as const) : ('PENDING_AUDIT' as const),
      myAuditId: mine?.id ?? null,
      isReaudit: p.version > 1,
    };
  }

  async queue(caller: AuthUser, q: AuditQueueDto) {
    const where = this.queueWhere(caller, q);
    const [rows, total] = await Promise.all([
      this.prisma.productionEntry.findMany({
        where,
        include: this.queueInclude(caller),
        orderBy: [{ codedDate: 'asc' }, { createdAt: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.productionEntry.count({ where }),
    ]);
    return { data: rows.map((r) => this.toQueueItem(r)), total, page: q.page, pageSize: q.pageSize };
  }

  async exportQueue(caller: AuthUser, format: ExportFormat, q: Partial<AuditQueueDto>) {
    const rows = await this.prisma.productionEntry.findMany({
      where: this.queueWhere(caller, q),
      include: this.queueInclude(caller),
      orderBy: [{ codedDate: 'asc' }, { createdAt: 'asc' }],
      take: 10_000,
    });
    return this.exporter.stream(format, {
      title: 'Audit Queue',
      generatedBy: caller.loginName,
      filters: { search: q.search, state: q.state },
      columns: [
        { key: 'chartId', label: 'Chart ID' },
        { key: 'project', label: 'Project' },
        { key: 'version', label: 'Version', numeric: true },
        { key: 'coder', label: 'Coder Name' },
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'pageCount', label: 'Page Count', numeric: true },
        { key: 'totalICDs', label: 'Total ICDs', numeric: true },
        { key: 'totalDOS', label: 'Total DOS', numeric: true },
        { key: 'codedDate', label: 'Coded Date' },
        { key: 'state', label: 'Queue State' },
        { key: 'reaudit', label: 'Re-audit' },
      ],
      rows: rows.map((r) => this.toQueueItem(r)).map((i) => ({
        chartId: i.chartId,
        project: i.project?.name ?? '',
        version: i.version,
        coder: i.coder.fullName ?? i.coder.loginName,
        employeeId: i.coder.employeeId,
        pageCount: i.pageCount,
        totalICDs: i.totalICDs,
        totalDOS: i.totalDOS,
        codedDate: i.codedDate,
        state: i.queueState === 'IN_PROGRESS' ? 'In progress' : 'Pending audit',
        reaudit: i.isReaudit ? 'Yes' : 'No',
      })),
    });
  }

  // ─── create / update / resolve / re-audit ───────────────────

  async create(caller: AuthUser, dto: CreateAuditDto) {
    if (caller.role !== 'AUDITOR') throw new ForbiddenException('Only an Auditor creates audits');
    const auditDate = toDate(dto.auditDate, 'Audit date');
    const totalErrors = this.assertTotal(dto.auditErrors, dto.errorExceptions, dto.totalErrors);
    const chartId = dto.chartId.trim();
    const check = await this.checkAuditable(caller, chartId);
    if (!check.ok) {
      if (check.kind === 'notfound') throw new NotFoundException(check.message);
      if (check.kind === 'duplicate') throw new ConflictException(check.message);
      throw new BadRequestException(check.message);
    }

    const audit = await this.prisma.$transaction(async (tx) => {
      await this.lockProduction(tx, check.production.id);
      const existing = await tx.auditEntry.count({ where: { productionEntryId: check.production.id } });
      if (existing > 0) throw new ConflictException(`Chart ${chartId} was audited by someone else just now`);
      const created = await tx.auditEntry.create({
        data: {
          productionEntryId: check.production.id,
          chartId,
          auditorId: caller.id,
          auditErrors: dto.auditErrors,
          errorExceptions: dto.errorExceptions,
          totalErrors,
          status: dto.status,
          auditDate,
          remarks: dto.remarks?.trim() || null,
        },
        include: AUDIT_INCLUDE,
      });
      await writeAuditLog(tx, caller, 'AUDIT_CREATED', 'AuditEntry', created.id, {
        after: { chartId, version: check.production.version, status: dto.status, auditErrors: dto.auditErrors, errorExceptions: dto.errorExceptions, totalErrors },
      });
      await this.logStatus(tx, caller, created.id, dto.status, chartId);
      return created;
    });
    return toAuditDto(audit);
  }

  private listWhere(caller: AuthUser, q: Partial<ListAuditsDto>): Prisma.AuditEntryWhereInput {
    // AND-composed so a filter can only narrow the role scope, never replace part of it.
    const and: Prisma.AuditEntryWhereInput[] = [auditScope(caller)];
    if (q.status) and.push({ status: q.status as AuditStatus });
    const search = q.search?.trim();
    if (search) and.push({ chartId: { contains: search, mode: 'insensitive' } });
    const range = dateRange(q.from, q.to);
    if (range) and.push({ auditDate: range });
    if (q.projectId) and.push({ productionEntry: { chart: { projectId: q.projectId } } });
    return { AND: and };
  }

  async list(caller: AuthUser, q: ListAuditsDto) {
    const where = this.listWhere(caller, q);
    const [rows, total] = await Promise.all([
      this.prisma.auditEntry.findMany({
        where,
        include: AUDIT_INCLUDE,
        orderBy: [{ auditDate: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.auditEntry.count({ where }),
    ]);
    return { data: rows.map(toAuditDto), total, page: q.page, pageSize: q.pageSize };
  }

  async export(caller: AuthUser, format: ExportFormat, q: Partial<ListAuditsDto>) {
    const rows = await this.prisma.auditEntry.findMany({
      where: this.listWhere(caller, q),
      include: AUDIT_INCLUDE,
      orderBy: [{ auditDate: 'desc' }, { createdAt: 'desc' }],
      take: 10_000,
    });
    return this.exporter.stream(format, {
      title: caller.role === 'AUDITOR' ? 'My Audits' : 'Audits',
      generatedBy: caller.loginName,
      filters: { search: q.search, status: q.status, from: q.from, to: q.to },
      columns: AUDIT_EXPORT_COLUMNS,
      rows: rows.map(auditExportRow),
    });
  }

  async get(caller: AuthUser, id: string) {
    const row = await this.prisma.auditEntry.findFirst({ where: { id, ...auditScope(caller) }, include: AUDIT_INCLUDE });
    if (!row) throw new NotFoundException('Audit not found');
    return toAuditDto(row);
  }

  async update(caller: AuthUser, id: string, dto: UpdateAuditDto) {
    if (caller.role !== 'AUDITOR') throw new ForbiddenException('Only the Auditor who created an audit can edit it');
    const audit = await this.prisma.auditEntry.findUnique({ where: { id } });
    if (!audit || audit.auditorId !== caller.id) throw new NotFoundException('Audit not found');
    if (!(await this.chartForCaller(caller, audit.chartId))) throw new NotFoundException('Audit not found');
    if (!EDITABLE.includes(audit.status as AuditStatus)) {
      throw new ConflictException(`A ${audit.status} audit cannot be edited${audit.status === 'COMPLETED' ? ' - completed audits are immutable' : ''}`);
    }
    if (dto.status && dto.status !== audit.status) {
      const allowed = AUDIT_TRANSITIONS[audit.status as AuditStatus];
      if (!(allowed as string[]).includes(dto.status)) {
        throw new BadRequestException(`Cannot change audit status from ${audit.status} to ${dto.status}`);
      }
    }
    const auditErrors = dto.auditErrors ?? audit.auditErrors;
    const errorExceptions = dto.errorExceptions ?? audit.errorExceptions;
    const totalErrors = this.assertTotal(auditErrors, errorExceptions, dto.totalErrors);
    const auditDate = dto.auditDate !== undefined ? toDate(dto.auditDate, 'Audit date') : undefined;

    const updated = await this.prisma.auditEntry.update({
      where: { id },
      data: {
        auditErrors,
        errorExceptions,
        totalErrors,
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(auditDate ? { auditDate } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks.trim() || null } : {}),
      },
      include: AUDIT_INCLUDE,
    });
    await writeAuditLog(this.prisma, caller, 'AUDIT_UPDATED', 'AuditEntry', id, {
      before: { status: audit.status, auditErrors: audit.auditErrors, errorExceptions: audit.errorExceptions, totalErrors: audit.totalErrors },
      after: { status: updated.status, auditErrors, errorExceptions, totalErrors },
    });
    if (updated.status !== audit.status) await this.logStatus(this.prisma, caller, id, updated.status, audit.chartId);
    return toAuditDto(updated);
  }

  /** Team Lead (own team's charts) or Manager resolves REVIEW_REQUIRED to COMPLETED or REJECTED. */
  async resolve(caller: AuthUser, id: string, dto: ResolveAuditDto) {
    if (caller.role !== 'TEAM_LEAD' && caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Team Lead or Manager can resolve a review');
    }
    const audit = await this.prisma.auditEntry.findUnique({ where: { id } });
    if (!audit || !(await this.chartForCaller(caller, audit.chartId))) throw new NotFoundException('Audit not found');
    if (audit.status !== 'REVIEW_REQUIRED') throw new ConflictException('Only a REVIEW_REQUIRED audit can be resolved');
    const updated = await this.prisma.auditEntry.update({
      where: { id },
      data: { status: dto.status, ...(dto.remarks !== undefined ? { remarks: dto.remarks.trim() || null } : {}) },
      include: AUDIT_INCLUDE,
    });
    await writeAuditLog(this.prisma, caller, 'AUDIT_RESOLVED', 'AuditEntry', id, {
      before: { status: 'REVIEW_REQUIRED' },
      after: { status: dto.status, chartId: audit.chartId },
    });
    return toAuditDto(updated);
  }

  /**
   * Re-audit: only when the target is the latest audit on a still-current
   * COMPLETED version and it was REJECTED. Always a NEW AuditEntry row -
   * the rejected one is never touched.
   */
  async reaudit(caller: AuthUser, id: string, dto: ReauditDto) {
    if (caller.role !== 'AUDITOR' && caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only an Auditor or Manager can re-audit');
    }
    const target = await this.prisma.auditEntry.findUnique({ where: { id }, include: { productionEntry: true } });
    if (!target || !(await this.chartForCaller(caller, target.chartId))) throw new NotFoundException('Audit not found');
    if (target.status !== 'REJECTED') throw new ConflictException('Only a REJECTED audit can be re-audited');
    const production = target.productionEntry;
    if (!production.isCurrent) {
      throw new ConflictException('This production version was reworked - audit the new current version instead of re-auditing');
    }
    if (production.status !== 'COMPLETED') throw new ConflictException(`Production is ${production.status}; only COMPLETED production can be audited`);
    const auditDate = toDate(dto.auditDate, 'Audit date');
    const totalErrors = this.assertTotal(dto.auditErrors, dto.errorExceptions, dto.totalErrors);

    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockProduction(tx, production.id);
      const latest = await tx.auditEntry.findFirst({ where: { productionEntryId: production.id }, orderBy: { createdAt: 'desc' } });
      if (latest?.id !== target.id) throw new ConflictException('A newer audit already exists for this version');
      const row = await tx.auditEntry.create({
        data: {
          productionEntryId: production.id,
          chartId: target.chartId,
          auditorId: caller.id,
          auditErrors: dto.auditErrors,
          errorExceptions: dto.errorExceptions,
          totalErrors,
          status: dto.status,
          auditDate,
          remarks: dto.remarks?.trim() || null,
        },
        include: AUDIT_INCLUDE,
      });
      await writeAuditLog(tx, caller, 'REAUDIT_CREATED', 'AuditEntry', row.id, {
        before: { previousAuditId: target.id, status: 'REJECTED' },
        after: { chartId: target.chartId, version: production.version, status: dto.status, totalErrors },
      });
      await this.logStatus(tx, caller, row.id, dto.status, target.chartId, true);
      return row;
    });
    return toAuditDto(created);
  }

  // ─── CSV import (audit records only - never production) ─────

  private async validateImport(caller: AuthUser, file: UploadedCsvFile | undefined) {
    if (caller.role !== 'AUDITOR') throw new ForbiddenException('Only an Auditor can import audits');
    const { fileName, headers, rows } = readCsvUpload(file, AUDIT_IMPORT_HEADERS, AUDIT_IMPORT_HEADERS.filter((h) => h !== 'remarks'));
    const records = toRecords(headers, rows);
    const num = (v: string) => (/^-?\d+$/.test(v) ? Number(v) : v);
    const seen = new Map<string, number>();
    const out: { result: ImportRowResult; dto: CreateAuditDto | null; productionId: string | null }[] = [];

    for (const [i, rec] of records.entries()) {
      const rowNumber = i + 2;
      const errors: string[] = [];
      const dto = plainToInstance(CreateAuditDto, {
        chartId: rec.chartId,
        auditErrors: num(rec.auditErrors),
        errorExceptions: num(rec.errorExceptions),
        status: rec.status.toUpperCase().replace(/\s+/g, '_'),
        auditDate: rec.auditDate,
        remarks: rec.remarks || undefined,
      });
      for (const err of validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })) {
        errors.push(...Object.values(err.constraints ?? {}).map((m) => `${err.property}: ${m}`));
      }
      if (rec.auditDate && isValidIsoDate(rec.auditDate) && !isNotFutureDate(rec.auditDate)) errors.push('auditDate: cannot be in the future');
      else if (rec.auditDate && /^\d{4}-\d{2}-\d{2}$/.test(rec.auditDate) && !isValidIsoDate(rec.auditDate)) errors.push('auditDate: not a real calendar date');

      let status: ImportRowResult['status'] = errors.length ? 'invalid' : 'valid';
      let productionId: string | null = null;
      if (status === 'valid') {
        const first = seen.get(dto.chartId);
        if (first !== undefined) {
          status = 'duplicate';
          errors.push(`chartId "${dto.chartId}" is repeated (first seen on row ${first})`);
        } else {
          seen.set(dto.chartId, rowNumber);
          const check = await this.checkAuditable(caller, dto.chartId);
          if (check.ok) productionId = check.production.id;
          else {
            status = check.kind === 'duplicate' ? 'duplicate' : 'invalid';
            errors.push(check.message);
          }
        }
      }
      out.push({ result: { rowNumber, status, errors, data: rec }, dto: status === 'valid' ? dto : null, productionId });
    }
    return { fileName, rows: out };
  }

  async importPreview(caller: AuthUser, file: UploadedCsvFile | undefined): Promise<ImportPreviewResponse> {
    const { fileName, rows } = await this.validateImport(caller, file);
    return summarize(fileName, rows.map((r) => r.result));
  }

  /** Authoritative re-validation, then all valid rows in one transaction (all or nothing). */
  async importCommit(caller: AuthUser, file: UploadedCsvFile | undefined): Promise<ImportCommitResponse> {
    const { fileName, rows } = await this.validateImport(caller, file);
    const valid = rows.filter((r) => r.dto && r.productionId);
    const results = rows.map((r) => r.result);
    await writeAuditLog(this.prisma, caller, 'AUDIT_IMPORT_STARTED', 'AuditEntry', null, {
      after: { fileName, totalRows: rows.length, validRows: valid.length },
    });
    if (valid.length === 0) {
      await writeAuditLog(this.prisma, caller, 'AUDIT_IMPORT_REJECTED', 'AuditEntry', null, { after: { fileName, reason: 'no valid rows' } });
      throw new BadRequestException({ message: 'No valid rows to import', ...summarize(fileName, results) });
    }
    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const { dto, productionId } of valid) {
            await this.lockProduction(tx, productionId!);
            if ((await tx.auditEntry.count({ where: { productionEntryId: productionId! } })) > 0) {
              throw new ConflictException(`Chart ${dto!.chartId} was audited by someone else during the import`);
            }
            const totalErrors = calculateTotalErrors(dto!.auditErrors, dto!.errorExceptions);
            const created = await tx.auditEntry.create({
              data: {
                productionEntryId: productionId!,
                chartId: dto!.chartId,
                auditorId: caller.id,
                auditErrors: dto!.auditErrors,
                errorExceptions: dto!.errorExceptions,
                totalErrors,
                status: dto!.status,
                auditDate: new Date(`${dto!.auditDate}T00:00:00.000Z`),
                remarks: dto!.remarks?.trim() || null,
              },
            });
            await writeAuditLog(tx, caller, 'AUDIT_CREATED', 'AuditEntry', created.id, {
              after: { chartId: dto!.chartId, status: dto!.status, totalErrors, source: 'csv-import' },
            });
            await this.logStatus(tx, caller, created.id, dto!.status, dto!.chartId);
          }
          await writeAuditLog(tx, caller, 'AUDIT_IMPORT_COMPLETED', 'AuditEntry', null, {
            after: { fileName, imported: valid.length, skipped: rows.length - valid.length },
          });
        },
        { timeout: 60_000 },
      );
    } catch (e) {
      await writeAuditLog(this.prisma, caller, 'AUDIT_IMPORT_REJECTED', 'AuditEntry', null, {
        after: { fileName, reason: e instanceof Error ? e.message : 'transaction failed' },
      });
      throw e;
    }
    return { fileName, imported: valid.length, skipped: rows.length - valid.length, rows: results };
  }
}
