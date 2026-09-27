import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@smartcode/types';
import { isNotFutureDate, isValidIsoDate } from '@smartcode/types';

/** Team-scoped roles must actually have a team; null must never match null. */
export function requireTeam(caller: AuthUser): string {
  if (!caller.teamId) {
    throw new ForbiddenException('You are not assigned to a team. Ask your Manager to assign you to a team.');
  }
  return caller.teamId;
}

/**
 * Row-level chart visibility (docs/09-BUSINESS-RULES.md "Chart Assignment"):
 * Manager all; Team Lead charts in their team's projects; Coder charts they
 * have submitted production against; Auditor charts in assigned projects.
 */
export function chartScope(caller: AuthUser): Prisma.ChartWhereInput {
  switch (caller.role) {
    case 'MANAGER':
      return {};
    case 'TEAM_LEAD':
      return { project: { teamId: requireTeam(caller) } };
    case 'CODER':
      return { productionEntries: { some: { coderId: caller.id } } };
    case 'AUDITOR':
      return { project: { auditorAssignments: { some: { auditorId: caller.id } } } };
    default:
      throw new ForbiddenException();
  }
}

/** Production visibility: Manager all, Team Lead own team's coders, Coder own. Auditors use the Chart ID lookup. */
export function productionScope(caller: AuthUser): Prisma.ProductionEntryWhereInput {
  switch (caller.role) {
    case 'MANAGER':
      return {};
    case 'TEAM_LEAD':
      return { coder: { teamId: requireTeam(caller) } };
    case 'CODER':
      return { coderId: caller.id };
    default:
      throw new ForbiddenException('Your role cannot list production records');
  }
}

/** Audit visibility: Manager all, Team Lead own team's charts, Auditor own audits. Coders have no audit access. */
export function auditScope(caller: AuthUser): Prisma.AuditEntryWhereInput {
  switch (caller.role) {
    case 'MANAGER':
      return {};
    case 'TEAM_LEAD':
      return { productionEntry: { chart: { project: { teamId: requireTeam(caller) } } } };
    case 'AUDITOR':
      return { auditorId: caller.id };
    default:
      throw new ForbiddenException('Your role cannot view audit records');
  }
}

/** Parses a validated YYYY-MM-DD into a UTC midnight Date. */
export function toDate(value: string, label: string): Date {
  if (!isValidIsoDate(value)) throw new BadRequestException(`${label} must be a valid date (YYYY-MM-DD)`);
  if (!isNotFutureDate(value)) throw new BadRequestException(`${label} cannot be in the future`);
  return new Date(`${value}T00:00:00.000Z`);
}

/** Inclusive date range filter from optional YYYY-MM-DD query params. */
export function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const range: Prisma.DateTimeFilter = {};
  if (from) {
    if (!isValidIsoDate(from)) throw new BadRequestException('from must be a valid date (YYYY-MM-DD)');
    range.gte = new Date(`${from}T00:00:00.000Z`);
  }
  if (to) {
    if (!isValidIsoDate(to)) throw new BadRequestException('to must be a valid date (YYYY-MM-DD)');
    range.lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (range.gte && range.lte && range.gte > range.lte) throw new BadRequestException('from must be on or before to');
  return range;
}

export function isoDay(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10);
}

export function personRef(u: { id: string; fullName: string | null; employeeId: string; loginName: string }) {
  return { id: u.id, fullName: u.fullName, employeeId: u.employeeId, loginName: u.loginName };
}

export const PERSON_SELECT = { id: true, fullName: true, employeeId: true, loginName: true } as const;

export const PROJECT_SELECT = {
  id: true,
  name: true,
  teamId: true,
  client: { select: { id: true, name: true } },
} as const;

export function projectRef(p: { id: string; name: string; client: { id: string; name: string } | null } | null) {
  return p ? { id: p.id, name: p.name, client: p.client ? { id: p.client.id, name: p.client.name } : null } : null;
}

/** Prisma unique-constraint violation (race between the pre-check and the insert). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}
