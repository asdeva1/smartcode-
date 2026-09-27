import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { REWORK_PENDING_STATUSES, type AuthUser, type ReworkStatus } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { writeAuditLog } from '../../common/audit-log';
import { PERSON_SELECT, PROJECT_SELECT, isUniqueViolation, isoDay, personRef, projectRef, requireTeam, toDate } from '../../common/scope';
import { auditorProjectWhere, requireVendor, vendorReworkWhere } from '../../common/vendor-scope';
import { PRODUCTION_INCLUDE } from '../production/production.service';
import { resolveRework } from './rework.workflow';
import { ListReworkDto, ResolveReworkDto } from './dto/rework.dto';

const REWORK_INCLUDE = {
  coder: { select: PERSON_SELECT },
  auditor: { select: PERSON_SELECT },
  teamLead: { select: PERSON_SELECT },
  resolvedBy: { select: PERSON_SELECT },
  team: { select: { id: true, name: true } },
  project: { select: PROJECT_SELECT },
  auditEntry: { select: { id: true, status: true, auditDate: true, totalErrors: true } },
  originalProduction: {
    select: { id: true, version: true, pageCount: true, totalICDs: true, totalDOS: true, codedDate: true, remarks: true },
  },
  reworkProduction: { select: { id: true, version: true, status: true } },
} as const;

type ReworkRow = Prisma.ReworkGetPayload<{ include: typeof REWORK_INCLUDE }>;

const EDITABLE_PRODUCTION = ['PENDING', 'IN_PROGRESS', 'REWORK'];
const OPEN_AUDIT = ['PENDING', 'IN_PROGRESS', 'REVIEW_REQUIRED'];

function toReworkDto(r: ReworkRow, unread: Set<string>) {
  return {
    id: r.id,
    chartId: r.chartId,
    status: r.status as ReworkStatus,
    reason: r.reason,
    resolutionNote: r.resolutionNote,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    resolvedAt: r.resolvedAt,
    reauditedAt: r.reauditedAt,
    coder: personRef(r.coder),
    auditor: personRef(r.auditor),
    teamLead: r.teamLead ? personRef(r.teamLead) : null,
    resolvedBy: r.resolvedBy ? personRef(r.resolvedBy) : null,
    team: r.team,
    project: projectRef(r.project),
    audit: { id: r.auditEntry.id, status: r.auditEntry.status, auditDate: isoDay(r.auditEntry.auditDate), totalErrors: r.auditEntry.totalErrors },
    originalProduction: {
      id: r.originalProduction.id,
      version: r.originalProduction.version,
      pageCount: r.originalProduction.pageCount,
      totalICDs: r.originalProduction.totalICDs,
      totalDOS: r.originalProduction.totalDOS,
      codedDate: isoDay(r.originalProduction.codedDate),
      remarks: r.originalProduction.remarks,
    },
    reworkProduction: r.reworkProduction,
    unread: unread.has(r.id),
  };
}

/**
 * Rework visibility and the Coder's resolution. Scope (backend-enforced,
 * 404 outside it like every other module):
 *   Manager - all; Vendor - its own vendor's projects;
 *   Team Lead - their team; Coder - their own;
 *   Auditor - reworks they requested, plus any in their assigned
 *   (vendor-restricted) projects so they can see what is ready to re-audit.
 */
@Injectable()
export class ReworkService {
  constructor(private readonly prisma: PrismaService) {}

  scope(caller: AuthUser): Prisma.ReworkWhereInput {
    switch (caller.role) {
      case 'MANAGER':
        return {};
      case 'VENDOR':
        return vendorReworkWhere(requireVendor(caller));
      case 'TEAM_LEAD':
        return { teamId: requireTeam(caller) };
      case 'CODER':
        return { coderId: caller.id };
      case 'AUDITOR':
        return { OR: [{ auditorId: caller.id }, { project: auditorProjectWhere(caller) }] };
      default:
        throw new ForbiddenException();
    }
  }

  private where(caller: AuthUser, q: Partial<ListReworkDto>): Prisma.ReworkWhereInput {
    const and: Prisma.ReworkWhereInput[] = [this.scope(caller)];
    if (q.status === 'pending') and.push({ status: { in: REWORK_PENDING_STATUSES } });
    else if (q.status) and.push({ status: q.status as ReworkStatus });
    const search = q.search?.trim();
    if (search) and.push({ chartId: { contains: search, mode: 'insensitive' } });
    if (q.vendorId) and.push(vendorReworkWhere(q.vendorId));
    return { AND: and };
  }

  /** Ids (among `ids`) the caller has an unread notification for. Read-only - never creates notifications. */
  private async unreadFor(caller: AuthUser, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.notification.findMany({
      where: { userId: caller.id, isRead: false, entity: 'Rework', entityId: { in: ids } },
      select: { entityId: true },
    });
    return new Set(rows.map((r) => r.entityId!).filter(Boolean));
  }

  async list(caller: AuthUser, q: ListReworkDto) {
    const where = this.where(caller, q);
    const [rows, total] = await Promise.all([
      this.prisma.rework.findMany({
        where,
        include: REWORK_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.rework.count({ where }),
    ]);
    const unread = await this.unreadFor(caller, rows.map((r) => r.id));
    return { data: rows.map((r) => toReworkDto(r, unread)), total, page: q.page, pageSize: q.pageSize };
  }

  /** Dashboard widget: counts, the caller's unread count and the latest live items. */
  async summary(caller: AuthUser, vendorId?: string) {
    const scope = this.where(caller, { vendorId });
    const count = (status: ReworkStatus) => this.prisma.rework.count({ where: { AND: [scope, { status }] } });
    const [open, inProgress, resolved, reaudited, recent, unreadRows] = await Promise.all([
      count('OPEN'),
      count('IN_PROGRESS'),
      count('RESOLVED'),
      count('REAUDITED'),
      this.prisma.rework.findMany({
        where: { AND: [scope, { status: { in: ['OPEN', 'IN_PROGRESS', 'RESOLVED'] } }] },
        include: REWORK_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      this.prisma.notification.findMany({
        where: { userId: caller.id, isRead: false, entity: 'Rework' },
        select: { entityId: true },
      }),
    ]);
    // Only count unread items the caller can still see.
    const unreadIds = [...new Set(unreadRows.map((r) => r.entityId).filter((x): x is string => !!x))];
    const visibleUnread = unreadIds.length
      ? await this.prisma.rework.count({ where: { AND: [scope, { id: { in: unreadIds } }] } })
      : 0;
    const unread = new Set(unreadIds);
    return { open, inProgress, resolved, reaudited, unread: visibleUnread, recent: recent.map((r) => toReworkDto(r, unread)) };
  }

  private async findVisible(caller: AuthUser, id: string) {
    const row = await this.prisma.rework.findFirst({ where: { AND: [{ id }, this.scope(caller)] }, include: REWORK_INCLUDE });
    if (!row) throw new NotFoundException('Rework not found');
    return row;
  }

  async get(caller: AuthUser, id: string) {
    const row = await this.findVisible(caller, id);
    return toReworkDto(row, await this.unreadFor(caller, [row.id]));
  }

  /** Marks the caller's own notifications about this rework as read (opening the item). */
  async markRead(caller: AuthUser, id: string) {
    await this.findVisible(caller, id);
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: caller.id, entity: 'Rework', entityId: id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { id, markedRead: count };
  }

  /**
   * Coder resolves their own rework with the corrected values. If the
   * rework has not been started yet, the correction is created as the
   * next version (the audited version is left exactly as it was);
   * otherwise the in-progress correction version is completed. Either way
   * the rework becomes RESOLVED and Team Lead + Auditor are notified.
   */
  async resolve(caller: AuthUser, id: string, dto: ResolveReworkDto) {
    if (caller.role !== 'CODER') throw new ForbiddenException('Only the Coder can resolve their rework');
    const rework = await this.prisma.rework.findUnique({ where: { id } });
    if (!rework || rework.coderId !== caller.id) throw new NotFoundException('Rework not found');
    if (rework.status !== 'OPEN' && rework.status !== 'IN_PROGRESS') {
      throw new ConflictException(`This rework is already ${rework.status.toLowerCase().replace('_', ' ')}`);
    }
    const note = dto.resolutionNote.trim();
    if (note.length < 3) throw new BadRequestException('Describe what was corrected (at least 3 characters)');
    const codedDate = toDate(dto.codedDate, 'Coded date');
    const fields = {
      pageCount: dto.pageCount,
      totalICDs: dto.totalICDs,
      totalDOS: dto.totalDOS,
      codedDate,
      remarks: dto.remarks?.trim() || null,
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        // Serialise with audits/rework on the same chart.
        await tx.$queryRaw`SELECT id FROM "ProductionEntry" WHERE id = ${rework.originalProductionId} FOR UPDATE`;
        const fresh = await tx.rework.findUnique({ where: { id } });
        if (!fresh || (fresh.status !== 'OPEN' && fresh.status !== 'IN_PROGRESS')) {
          throw new ConflictException('This rework was changed by someone else - refresh and try again');
        }

        let versionId: string;
        if (!fresh.reworkProductionId) {
          const original = await tx.productionEntry.findUnique({
            where: { id: fresh.originalProductionId },
            include: { auditEntries: { select: { status: true } } },
          });
          if (!original || !original.isCurrent || original.status !== 'COMPLETED') {
            throw new ConflictException('The audited version is no longer current - refresh and try again');
          }
          if (original.auditEntries.some((a) => OPEN_AUDIT.includes(a.status))) {
            throw new ConflictException('An audit on this version is still open');
          }
          await tx.productionEntry.update({ where: { id: original.id }, data: { isCurrent: false } });
          const next = await tx.productionEntry.create({
            data: { chartId: original.chartId, coderId: original.coderId, version: original.version + 1, isCurrent: true, status: 'COMPLETED', ...fields },
            include: PRODUCTION_INCLUDE,
          });
          await writeAuditLog(tx, caller, 'REWORK_INITIATED', 'ProductionEntry', next.id, {
            before: { productionEntryId: original.id, version: original.version, status: 'COMPLETED' },
            after: { chartId: original.chartId, version: next.version, status: 'COMPLETED', source: 'rework-resolution' },
          });
          await tx.rework.update({ where: { id }, data: { reworkProductionId: next.id } });
          versionId = next.id;
        } else {
          const version = await tx.productionEntry.findUnique({ where: { id: fresh.reworkProductionId } });
          if (!version || !version.isCurrent) throw new ConflictException('The rework version is no longer current');
          if (version.status !== 'COMPLETED') {
            if (!EDITABLE_PRODUCTION.includes(version.status)) throw new ConflictException(`A ${version.status} version cannot be completed`);
            await tx.productionEntry.update({ where: { id: version.id }, data: { ...fields, status: 'COMPLETED' } });
            await writeAuditLog(tx, caller, 'PRODUCTION_UPDATED', 'ProductionEntry', version.id, {
              before: { status: version.status, pageCount: version.pageCount, totalICDs: version.totalICDs, totalDOS: version.totalDOS, codedDate: isoDay(version.codedDate) },
              after: { status: 'COMPLETED', pageCount: fields.pageCount, totalICDs: fields.totalICDs, totalDOS: fields.totalDOS, codedDate: dto.codedDate },
            });
          }
          versionId = version.id;
        }
        const version = await tx.productionEntry.findUnique({ where: { id: versionId }, select: { chartId: true, version: true } });
        await writeAuditLog(tx, caller, 'REWORK_RESOLVED', 'ProductionEntry', versionId, { after: { chartId: version?.chartId, version: version?.version } });
        await resolveRework(tx, caller, fresh, note);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('This chart was changed by someone else - refresh and try again');
      throw e;
    }
    return this.get(caller, id);
  }
}
