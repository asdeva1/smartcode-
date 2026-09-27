import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CODER_IMPORT_HEADERS,
  canCreateRole,
  type AuthUser,
  type ExportFormat,
  type ImportCommitResponse,
  type ImportPreviewResponse,
  type ImportRowResult,
} from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { LocalAuthProvider } from '../auth/providers/local-auth.provider';
import { ExportService } from '../../common/export/export.service';
import { readCsvUpload, toRecords, type UploadedCsvFile } from '../../common/csv/csv-upload';
import { isUniqueViolation, requireTeam } from '../../common/scope';
import { requireVendor } from '../../common/vendor-scope';
import { writeAuditLog } from '../../common/audit-log';
import { CreateCoderDto } from './dto/create-coder.dto';
import { UpdateCoderDto } from './dto/update-coder.dto';
import { ListCodersDto } from './dto/list-coders.dto';
import { toCoderDto } from './coder.mapper';

const PASSWORD_FIELDS = new Set(['password', 'confirmPassword']);

/**
 * Section 2/3/10: "View assigned Team Lead" / "View assigned Project(s)" /
 * Coder profile's "Vendor" field - Team Lead and Project(s) are derived
 * through the Coder's current team; Vendor is the authoritative
 * User.vendorId set once at creation (see docs/09-BUSINESS-RULES.md
 * "Vendor -> Team Lead -> Coder Hierarchy").
 */
const TEAM_INCLUDE = {
  team: {
    select: {
      id: true,
      name: true,
      teamLead: { select: { id: true, fullName: true, employeeId: true, loginName: true } },
      projects: { select: { id: true, name: true }, where: { isActive: true }, orderBy: { name: 'asc' } },
    },
  },
  vendor: { select: { id: true, name: true } },
} as const;

interface ValidatedCoderRow {
  result: ImportRowResult;
  dto: CreateCoderDto | null;
}

/**
 * Team Lead / Vendor -> Coder management beyond creation (which lives in
 * UsersService.createCoder so the existing POST /team-leads/coders
 * contract is unchanged). Every method re-derives the caller's team or
 * vendor from the session; a client-supplied id is never trusted.
 *
 * CSV import/export stay Team-Lead-only (assertCanImport) - the Vendor
 * Portal's Coder screen (docs/09-BUSINESS-RULES.md "Coder Creation From
 * Vendor Portal") only asks for create/view/edit/activate/deactivate.
 */
@Injectable()
export class CodersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: ExportService,
  ) {}

  private scope(caller: AuthUser): Prisma.UserWhereInput {
    if (caller.role === 'TEAM_LEAD') return { role: 'CODER', teamId: requireTeam(caller) };
    if (caller.role === 'VENDOR') return { role: 'CODER', vendorId: requireVendor(caller) };
    throw new ForbiddenException('Only a Team Lead or a Vendor manages Coders');
  }

  private where(caller: AuthUser, query: Pick<ListCodersDto, 'search' | 'status'>): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = { ...this.scope(caller) };
    if (query.status === 'active') where.isActive = true;
    if (query.status === 'inactive') where.isActive = false;
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { loginName: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async list(caller: AuthUser, query: ListCodersDto) {
    const where = this.where(caller, query);
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: TEAM_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data: rows.map(toCoderDto), total, page: query.page, pageSize: query.pageSize };
  }

  private async findOwn(caller: AuthUser, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, ...this.scope(caller) }, include: TEAM_INCLUDE });
    // Same 404 for "doesn't exist" and "outside your scope" - no cross-team/cross-vendor probing.
    if (!user) throw new NotFoundException('Coder not found in your scope');
    return user;
  }

  async get(caller: AuthUser, id: string) {
    const user = await this.findOwn(caller, id);
    const current = await this.prisma.productionEntry.findMany({
      where: { coderId: id, isCurrent: true },
      select: { status: true, pageCount: true, totalDOS: true, totalICDs: true },
    });
    const count = (s: string) => current.filter((p) => p.status === s).length;
    return {
      ...toCoderDto(user),
      stats: {
        charts: current.length,
        completed: count('COMPLETED'),
        inProgress: count('IN_PROGRESS') + count('PENDING'),
        rework: count('REWORK'),
        pages: current.reduce((a, p) => a + p.pageCount, 0),
        dos: current.reduce((a, p) => a + p.totalDOS, 0),
        icds: current.reduce((a, p) => a + p.totalICDs, 0),
      },
    };
  }

  async update(caller: AuthUser, id: string, dto: UpdateCoderDto) {
    const target = await this.findOwn(caller, id);
    if (dto.employeeId || dto.email) {
      const conflict = await this.prisma.user.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(dto.employeeId ? [{ employeeId: dto.employeeId }] : []),
            ...(dto.email ? [{ email: dto.email }] : []),
          ],
        },
      });
      if (conflict) throw new ConflictException('Another user already has this employee ID or email');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      },
    });
    await writeAuditLog(this.prisma, caller, 'USER_UPDATED', 'User', id, {
      before: { fullName: target.fullName, email: target.email, employeeId: target.employeeId },
      after: { fullName: updated.fullName, email: updated.email, employeeId: updated.employeeId },
    });
    return toCoderDto(updated);
  }

  async export(caller: AuthUser, format: ExportFormat, query: Pick<ListCodersDto, 'search' | 'status'>) {
    const rows = await this.prisma.user.findMany({ where: this.where(caller, query), orderBy: { createdAt: 'desc' } });
    return this.exporter.stream(format, {
      title: 'Team Coders',
      generatedBy: caller.loginName,
      filters: { search: query.search, status: query.status },
      columns: [
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'fullName', label: 'Full Name' },
        { key: 'loginName', label: 'Login Name' },
        { key: 'email', label: 'Email' },
        { key: 'status', label: 'Status' },
        { key: 'createdAt', label: 'Created Date' },
        { key: 'lastLoginAt', label: 'Last Login' },
      ],
      rows: rows.map((u) => ({
        employeeId: u.employeeId,
        fullName: u.fullName ?? '',
        loginName: u.loginName,
        email: u.email,
        status: u.isActive ? 'Active' : 'Inactive',
        createdAt: u.createdAt.toISOString().slice(0, 10),
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') : '',
      })),
    });
  }

  // ─── CSV import ─────────────────────────────────────────────

  private assertCanImport(caller: AuthUser) {
    if (caller.role !== 'TEAM_LEAD' || !canCreateRole(caller.role, 'CODER')) {
      throw new ForbiddenException('Only a Team Lead can import Coders');
    }
    requireTeam(caller);
  }

  /**
   * Validates every row with the same CreateCoderDto the single-create
   * endpoint uses, then flags duplicates both within the file and against
   * existing users. Passwords are masked in everything returned.
   */
  private async validateRows(file: UploadedCsvFile | undefined): Promise<{ fileName: string; rows: ValidatedCoderRow[] }> {
    const { fileName, headers, rows } = readCsvUpload(file, CODER_IMPORT_HEADERS, CODER_IMPORT_HEADERS.filter((h) => h !== 'status'));
    const records = toRecords(headers, rows);

    const validated: ValidatedCoderRow[] = records.map((rec, i) => {
      const errors: string[] = [];
      const statusRaw = (rec.status ?? '').trim().toLowerCase();
      let isActive = true;
      if (statusRaw === 'inactive') isActive = false;
      else if (statusRaw !== '' && statusRaw !== 'active') errors.push('status must be "Active" or "Inactive"');

      const dto = plainToInstance(CreateCoderDto, {
        employeeId: rec.employeeId,
        fullName: rec.fullName,
        loginName: rec.loginName,
        email: rec.email,
        password: rec.password,
        confirmPassword: rec.confirmPassword,
        isActive,
      });
      for (const err of validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })) {
        errors.push(...Object.values(err.constraints ?? {}).map((m) => `${err.property}: ${m}`));
      }
      const data = Object.fromEntries(
        Object.entries(rec).map(([k, v]) => [k, PASSWORD_FIELDS.has(k) ? (v ? '••••••' : '') : v]),
      );
      return {
        result: { rowNumber: i + 2, status: errors.length ? 'invalid' : 'valid', errors, data },
        dto: errors.length ? null : dto,
      };
    });

    // Duplicates within the file (first occurrence wins).
    const seen = { employeeId: new Map<string, number>(), loginName: new Map<string, number>(), email: new Map<string, number>() };
    for (const row of validated) {
      if (!row.dto) continue;
      for (const key of ['employeeId', 'loginName', 'email'] as const) {
        const value = row.dto[key];
        const first = seen[key].get(value);
        if (first !== undefined) {
          row.result.status = 'duplicate';
          row.result.errors.push(`${key} "${value}" is repeated (first seen on row ${first})`);
        } else {
          seen[key].set(value, row.result.rowNumber);
        }
      }
    }

    // Duplicates against existing users (exact match, same rule as single create).
    const candidates = validated.filter((r) => r.dto).map((r) => r.dto!);
    if (candidates.length > 0) {
      const existing = await this.prisma.user.findMany({
        where: {
          OR: [
            { employeeId: { in: candidates.map((c) => c.employeeId) } },
            { loginName: { in: candidates.map((c) => c.loginName) } },
            { email: { in: candidates.map((c) => c.email) } },
          ],
        },
        select: { employeeId: true, loginName: true, email: true },
      });
      const taken = {
        employeeId: new Set(existing.map((e) => e.employeeId)),
        loginName: new Set(existing.map((e) => e.loginName)),
        email: new Set(existing.map((e) => e.email)),
      };
      for (const row of validated) {
        if (!row.dto) continue;
        for (const key of ['employeeId', 'loginName', 'email'] as const) {
          if (taken[key].has(row.dto[key])) {
            row.result.status = 'duplicate';
            row.result.errors.push(`${key} "${row.dto[key]}" already exists`);
          }
        }
      }
    }
    for (const row of validated) if (row.result.status !== 'valid') row.dto = null;
    return { fileName, rows: validated };
  }

  async importPreview(caller: AuthUser, file: UploadedCsvFile | undefined): Promise<ImportPreviewResponse> {
    this.assertCanImport(caller);
    const { fileName, rows } = await this.validateRows(file);
    return summarize(fileName, rows.map((r) => r.result));
  }

  /**
   * Re-validates the file server-side (the preview is advisory, the commit
   * is authoritative), then creates every valid row in ONE transaction:
   * either all valid rows are created or none are. Invalid/duplicate rows
   * are skipped and reported, never partially written.
   */
  async importCommit(caller: AuthUser, file: UploadedCsvFile | undefined): Promise<ImportCommitResponse> {
    this.assertCanImport(caller);
    const teamId = requireTeam(caller);
    const { fileName, rows } = await this.validateRows(file);
    const valid = rows.filter((r) => r.dto);
    const results = rows.map((r) => r.result);

    await writeAuditLog(this.prisma, caller, 'CODER_IMPORT_STARTED', 'User', null, {
      after: { fileName, totalRows: rows.length, validRows: valid.length },
    });

    if (valid.length === 0) {
      await writeAuditLog(this.prisma, caller, 'CODER_IMPORT_REJECTED', 'User', null, {
        after: { fileName, reason: 'no valid rows', totalRows: rows.length },
      });
      throw new BadRequestException({ message: 'No valid rows to import', ...summarize(fileName, results) });
    }

    const prepared = await Promise.all(
      valid.map(async (r) => ({ dto: r.dto!, passwordHash: await LocalAuthProvider.hashPassword(r.dto!.password) })),
    );

    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const { dto, passwordHash } of prepared) {
            const user = await tx.user.create({
              data: {
                employeeId: dto.employeeId,
                fullName: dto.fullName,
                loginName: dto.loginName,
                email: dto.email,
                passwordHash,
                role: 'CODER',
                isActive: dto.isActive !== false,
                createdById: caller.id,
                teamId,
              },
            });
            await writeAuditLog(tx, caller, 'USER_CREATED', 'User', user.id, {
              after: { employeeId: user.employeeId, loginName: user.loginName, role: 'CODER', source: 'csv-import' },
            });
          }
          await writeAuditLog(tx, caller, 'CODER_IMPORT_COMPLETED', 'User', null, {
            after: { fileName, imported: prepared.length, skipped: rows.length - prepared.length },
          });
        },
        { timeout: 60_000 },
      );
    } catch (e) {
      await writeAuditLog(this.prisma, caller, 'CODER_IMPORT_REJECTED', 'User', null, {
        after: { fileName, reason: isUniqueViolation(e) ? 'duplicate detected during commit' : 'transaction failed' },
      });
      if (isUniqueViolation(e)) {
        throw new ConflictException('A duplicate employee ID, login name or email was created meanwhile - nothing was imported. Preview again.');
      }
      throw e;
    }

    return { fileName, imported: prepared.length, skipped: rows.length - prepared.length, rows: results };
  }
}

export function summarize(fileName: string, rows: ImportRowResult[]): ImportPreviewResponse {
  return {
    fileName,
    totalRows: rows.length,
    validRows: rows.filter((r) => r.status === 'valid').length,
    invalidRows: rows.filter((r) => r.status === 'invalid').length,
    duplicateRows: rows.filter((r) => r.status === 'duplicate').length,
    rows,
  };
}
