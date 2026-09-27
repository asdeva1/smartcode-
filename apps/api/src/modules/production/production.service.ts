import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PRODUCTION_TRANSITIONS, type AuthUser, type ExportFormat, type ProductionStatus } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from '../../common/export/export.service';
import { writeAuditLog } from '../../common/audit-log';
import {
  PERSON_SELECT,
  PROJECT_SELECT,
  dateRange,
  isUniqueViolation,
  isoDay,
  personRef,
  productionScope,
  projectRef,
  requireTeam,
  toDate,
} from '../../common/scope';
import { CreateProductionDto, ListProductionDto, UpdateProductionDto } from './dto/production.dto';

export const PRODUCTION_INCLUDE = {
  coder: { select: { ...PERSON_SELECT, teamId: true } },
  chart: { select: { project: { select: PROJECT_SELECT } } },
  _count: { select: { auditEntries: true } },
} as const;

export type ProductionRow = Prisma.ProductionEntryGetPayload<{ include: typeof PRODUCTION_INCLUDE }>;

export function toProductionDto(p: ProductionRow) {
  return {
    id: p.id,
    chartId: p.chartId,
    version: p.version,
    isCurrent: p.isCurrent,
    pageCount: p.pageCount,
    totalDOS: p.totalDOS,
    totalICDs: p.totalICDs,
    status: p.status,
    remarks: p.remarks,
    codedDate: isoDay(p.codedDate),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    coder: personRef(p.coder),
    project: projectRef(p.chart?.project ?? null),
    auditCount: p._count.auditEntries,
  };
}

/** Statuses a Coder may keep editing. COMPLETED is immutable (rework creates a new version). */
const EDITABLE: ProductionStatus[] = ['PENDING', 'IN_PROGRESS', 'REWORK'];
const OPEN_AUDIT = ['PENDING', 'IN_PROGRESS', 'REVIEW_REQUIRED'];
const EXPORT_ROW_CAP = 10_000;

/**
 * Production entry and versioning per docs/09-BUSINESS-RULES.md:
 * one current version per chart (also enforced by a partial unique
 * index), COMPLETED versions are never edited, rework creates a new
 * version pre-filled from the current one, cancellation is a status.
 */
@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: ExportService,
  ) {}

  async create(caller: AuthUser, dto: CreateProductionDto) {
    if (caller.role !== 'CODER') throw new ForbiddenException('Only a Coder enters production');
    const teamId = requireTeam(caller);
    const codedDate = toDate(dto.codedDate, 'Coded date');
    const chartId = dto.chartId.trim();

    const chart = await this.prisma.chart.findUnique({ where: { chartId }, include: { project: true } });
    let version = 1;
    let supersededId: string | null = null;

    if (chart) {
      if (chart.project.teamId !== teamId) {
        throw new ForbiddenException(`Chart ${chartId} belongs to a project outside your team`);
      }
      if (dto.projectId && dto.projectId !== chart.projectId) {
        throw new BadRequestException(`Chart ${chartId} already belongs to project "${chart.project.name}"`);
      }
      const current = await this.prisma.productionEntry.findFirst({ where: { chartId, isCurrent: true } });
      if (current && current.status !== 'CANCELLED') {
        throw new ConflictException(
          `Production already exists for chart ${chartId} (version ${current.version}, ${current.status}). Edit it or initiate rework instead.`,
        );
      }
      const max = await this.prisma.productionEntry.aggregate({ where: { chartId }, _max: { version: true } });
      version = (max._max.version ?? 0) + 1;
      supersededId = current?.id ?? null;
    } else {
      if (!dto.projectId) throw new BadRequestException('Select the project for this new Chart ID');
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project || !project.isActive) throw new NotFoundException('Project not found or inactive');
      if (project.teamId !== teamId) throw new ForbiddenException('This project is not assigned to your team');
    }

    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        if (!chart) await tx.chart.create({ data: { chartId, projectId: dto.projectId! } });
        if (supersededId) {
          await tx.productionEntry.update({ where: { id: supersededId }, data: { isCurrent: false } });
        }
        const created = await tx.productionEntry.create({
          data: {
            chartId,
            coderId: caller.id,
            version,
            isCurrent: true,
            pageCount: dto.pageCount,
            totalICDs: dto.totalICDs,
            totalDOS: dto.totalDOS,
            status: dto.status,
            remarks: dto.remarks?.trim() || null,
            codedDate,
          },
          include: PRODUCTION_INCLUDE,
        });
        await writeAuditLog(tx, caller, 'PRODUCTION_CREATED', 'ProductionEntry', created.id, {
          after: {
            chartId,
            version,
            status: dto.status,
            pageCount: dto.pageCount,
            totalICDs: dto.totalICDs,
            totalDOS: dto.totalDOS,
            codedDate: dto.codedDate,
          },
        });
        return created;
      });
      return toProductionDto(entry);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Production for chart ${chartId} was just created by someone else`);
      throw e;
    }
  }

  private where(caller: AuthUser, q: Partial<ListProductionDto>): Prisma.ProductionEntryWhereInput {
    // AND-composed so a filter can only narrow the role scope, never replace part of it.
    const and: Prisma.ProductionEntryWhereInput[] = [productionScope(caller)];
    if (!q.includeHistory) and.push({ isCurrent: true });
    if (q.status) and.push({ status: q.status as ProductionStatus });
    const search = q.search?.trim();
    if (search) and.push({ chartId: { contains: search, mode: 'insensitive' } });
    const range = dateRange(q.from, q.to);
    if (range) and.push({ codedDate: range });
    if (q.projectId) and.push({ chart: { projectId: q.projectId } });
    if (q.coderId && caller.role !== 'CODER') and.push({ coderId: q.coderId });
    return { AND: and };
  }

  async list(caller: AuthUser, q: ListProductionDto) {
    const where = this.where(caller, q);
    const [rows, total] = await Promise.all([
      this.prisma.productionEntry.findMany({
        where,
        include: PRODUCTION_INCLUDE,
        orderBy: [{ codedDate: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.productionEntry.count({ where }),
    ]);
    return { data: rows.map(toProductionDto), total, page: q.page, pageSize: q.pageSize };
  }

  async get(caller: AuthUser, id: string) {
    const row = await this.prisma.productionEntry.findFirst({ where: { id, ...productionScope(caller) }, include: PRODUCTION_INCLUDE });
    if (!row) throw new NotFoundException('Production entry not found');
    return toProductionDto(row);
  }

  async update(caller: AuthUser, id: string, dto: UpdateProductionDto) {
    if (caller.role !== 'CODER') throw new ForbiddenException('Only the Coder who entered production can edit it');
    const entry = await this.prisma.productionEntry.findUnique({ where: { id } });
    if (!entry || entry.coderId !== caller.id) throw new NotFoundException('Production entry not found');
    if (!entry.isCurrent) throw new ConflictException('Only the current version can be edited; earlier versions are history');
    if (!EDITABLE.includes(entry.status as ProductionStatus)) {
      throw new ConflictException(
        entry.status === 'COMPLETED'
          ? 'A COMPLETED production record cannot be edited - initiate rework to correct it'
          : `A ${entry.status} production record cannot be edited`,
      );
    }
    if (dto.status && dto.status !== entry.status) {
      const allowed = PRODUCTION_TRANSITIONS[entry.status as ProductionStatus].filter((s) => s !== 'CANCELLED' && s !== 'REWORK');
      if (!(allowed as string[]).includes(dto.status)) {
        throw new BadRequestException(
          `Cannot change status from ${entry.status} to ${dto.status}${allowed.length ? ` (allowed: ${allowed.join(', ')})` : ''}`,
        );
      }
    }
    const codedDate = dto.codedDate !== undefined ? toDate(dto.codedDate, 'Coded date') : undefined;

    const updated = await this.prisma.productionEntry.update({
      where: { id },
      data: {
        ...(dto.pageCount !== undefined ? { pageCount: dto.pageCount } : {}),
        ...(dto.totalICDs !== undefined ? { totalICDs: dto.totalICDs } : {}),
        ...(dto.totalDOS !== undefined ? { totalDOS: dto.totalDOS } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks.trim() || null } : {}),
        ...(codedDate ? { codedDate } : {}),
      },
      include: PRODUCTION_INCLUDE,
    });

    await writeAuditLog(this.prisma, caller, 'PRODUCTION_UPDATED', 'ProductionEntry', id, {
      before: {
        status: entry.status,
        pageCount: entry.pageCount,
        totalICDs: entry.totalICDs,
        totalDOS: entry.totalDOS,
        codedDate: isoDay(entry.codedDate),
      },
      after: {
        status: updated.status,
        pageCount: updated.pageCount,
        totalICDs: updated.totalICDs,
        totalDOS: updated.totalDOS,
        codedDate: isoDay(updated.codedDate),
      },
    });
    if (updated.status === 'COMPLETED' && entry.status !== 'COMPLETED' && updated.version > 1) {
      await writeAuditLog(this.prisma, caller, 'REWORK_RESOLVED', 'ProductionEntry', id, {
        after: { chartId: updated.chartId, version: updated.version },
      });
    }
    return toProductionDto(updated);
  }

  /** Coder (own), Team Lead (own team) or Manager may see this entry for rework/cancel. */
  private async findForAction(caller: AuthUser, id: string) {
    const entry = await this.prisma.productionEntry.findUnique({
      where: { id },
      include: { coder: { select: { teamId: true } }, auditEntries: { select: { status: true } } },
    });
    const visible =
      !!entry &&
      (caller.role === 'MANAGER' ||
        (caller.role === 'CODER' && entry.coderId === caller.id) ||
        (caller.role === 'TEAM_LEAD' && entry.coder.teamId === requireTeam(caller)));
    if (!entry || !visible) throw new NotFoundException('Production entry not found');
    return entry;
  }

  /**
   * COMPLETED -> REWORK. The original version is left exactly as it was
   * (status COMPLETED, just no longer current); a new version, pre-filled
   * from it, becomes current in status REWORK for the Coder to correct.
   */
  async rework(caller: AuthUser, id: string) {
    if (caller.role === 'AUDITOR') throw new ForbiddenException('Auditors cannot modify production');
    const entry = await this.findForAction(caller, id);
    if (!entry.isCurrent) throw new ConflictException('Only the current version can be sent to rework');
    if (entry.status !== 'COMPLETED') throw new ConflictException('Only a COMPLETED production record can be sent to rework');
    if (entry.auditEntries.some((a) => OPEN_AUDIT.includes(a.status))) {
      throw new ConflictException('An audit on this version is still open - it must be completed or rejected before rework');
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.productionEntry.update({ where: { id }, data: { isCurrent: false } });
        const next = await tx.productionEntry.create({
          data: {
            chartId: entry.chartId,
            coderId: entry.coderId,
            version: entry.version + 1,
            isCurrent: true,
            pageCount: entry.pageCount,
            totalICDs: entry.totalICDs,
            totalDOS: entry.totalDOS,
            status: 'REWORK',
            remarks: entry.remarks,
            codedDate: entry.codedDate,
          },
          include: PRODUCTION_INCLUDE,
        });
        await writeAuditLog(tx, caller, 'REWORK_INITIATED', 'ProductionEntry', next.id, {
          before: { productionEntryId: id, version: entry.version, status: 'COMPLETED' },
          after: { chartId: entry.chartId, version: next.version, status: 'REWORK' },
        });
        return next;
      });
      return toProductionDto(created);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('This chart was changed by someone else - refresh and try again');
      throw e;
    }
  }

  /** Team Lead (own team) or Manager cancels an un-audited current version. Never deletes. */
  async cancel(caller: AuthUser, id: string) {
    if (caller.role !== 'TEAM_LEAD' && caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Team Lead or Manager can cancel production');
    }
    const entry = await this.findForAction(caller, id);
    if (!entry.isCurrent) throw new ConflictException('Only the current version can be cancelled');
    if (entry.status === 'CANCELLED') throw new ConflictException('This production record is already cancelled');
    if (entry.auditEntries.length > 0) throw new ConflictException('Audited production cannot be cancelled');
    const updated = await this.prisma.productionEntry.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: PRODUCTION_INCLUDE,
    });
    await writeAuditLog(this.prisma, caller, 'PRODUCTION_CANCELLED', 'ProductionEntry', id, {
      before: { status: entry.status },
      after: { status: 'CANCELLED', chartId: entry.chartId, version: entry.version },
    });
    return toProductionDto(updated);
  }

  async export(caller: AuthUser, format: ExportFormat, q: Partial<ListProductionDto>) {
    const rows = await this.prisma.productionEntry.findMany({
      where: this.where(caller, q),
      include: PRODUCTION_INCLUDE,
      orderBy: [{ codedDate: 'desc' }, { createdAt: 'desc' }],
      take: EXPORT_ROW_CAP,
    });
    return this.exporter.stream(format, {
      title: caller.role === 'CODER' ? 'My Production' : caller.role === 'TEAM_LEAD' ? 'Team Production' : 'Production',
      generatedBy: caller.loginName,
      filters: { search: q.search, status: q.status, from: q.from, to: q.to, includeHistory: q.includeHistory ? 'yes' : undefined },
      columns: PRODUCTION_EXPORT_COLUMNS,
      rows: rows.map(productionExportRow),
    });
  }
}

export const PRODUCTION_EXPORT_COLUMNS = [
  { key: 'chartId', label: 'Chart ID' },
  { key: 'version', label: 'Version', numeric: true },
  { key: 'project', label: 'Project' },
  { key: 'coderName', label: 'Coder Name' },
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'loginName', label: 'Login Name' },
  { key: 'pageCount', label: 'Page Count', numeric: true },
  { key: 'totalICDs', label: 'Total ICDs', numeric: true },
  { key: 'totalDOS', label: 'Total DOS', numeric: true },
  { key: 'status', label: 'Status' },
  { key: 'codedDate', label: 'Coded Date' },
  { key: 'remarks', label: 'Remarks' },
];

export function productionExportRow(p: ProductionRow) {
  return {
    chartId: p.chartId,
    version: p.version,
    project: p.chart?.project?.name ?? '',
    coderName: p.coder.fullName ?? '',
    employeeId: p.coder.employeeId,
    loginName: p.coder.loginName,
    pageCount: p.pageCount,
    totalICDs: p.totalICDs,
    totalDOS: p.totalDOS,
    status: p.status,
    codedDate: isoDay(p.codedDate),
    remarks: p.remarks ?? '',
  };
}
