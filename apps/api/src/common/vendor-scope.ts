import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@smartcode/types';

/**
 * Vendor scope model
 * ------------------
 * A Vendor owns the Team Leads and Auditors actively assigned to it
 * (VendorAssignment, at most one active vendor per user - enforced by a
 * partial unique index). Everything else is derived, never copied:
 *
 *   Vendor -> Team Leads -> the Team each leads -> its Coders
 *                                               -> its Projects -> Charts
 *                                                  -> Production -> Audits
 *                                                  -> Rework
 *          -> Auditors (their project assignments must be vendor projects)
 *
 * These builders are the ONLY definition of "in vendor V" and are AND-ed
 * into database queries, so a vendor-scoped caller can never read another
 * vendor's rows whatever ids it sends.
 */
const activeIn = (vendorId: string) => ({ some: { vendorId, isActive: true } });

export function vendorTeamWhere(vendorId: string): Prisma.TeamWhereInput {
  return { teamLead: { vendorAssignments: activeIn(vendorId) } };
}

export function vendorProjectWhere(vendorId: string): Prisma.ProjectWhereInput {
  return { team: vendorTeamWhere(vendorId) };
}

export function vendorChartWhere(vendorId: string): Prisma.ChartWhereInput {
  return { project: vendorProjectWhere(vendorId) };
}

/** Production belongs to a vendor through the coder's team (mirrors Team Lead production scope). */
export function vendorProductionWhere(vendorId: string): Prisma.ProductionEntryWhereInput {
  return { coder: { team: vendorTeamWhere(vendorId) } };
}

/** Audits belong to a vendor through the chart's project team (mirrors Team Lead audit scope). */
export function vendorAuditWhere(vendorId: string): Prisma.AuditEntryWhereInput {
  return { productionEntry: { chart: vendorChartWhere(vendorId) } };
}

export function vendorReworkWhere(vendorId: string): Prisma.ReworkWhereInput {
  return { project: vendorProjectWhere(vendorId) };
}

export function vendorMemberWhere(vendorId: string, role: 'TEAM_LEAD' | 'AUDITOR'): Prisma.UserWhereInput {
  return { role, vendorAssignments: activeIn(vendorId) };
}

/** Coders in the vendor's teams. */
export function vendorCoderWhere(vendorId: string): Prisma.UserWhereInput {
  return { role: 'CODER', team: vendorTeamWhere(vendorId) };
}

/** Vendor accounts must carry their vendor; anything else is a broken account and fails closed. */
export function requireVendor(caller: AuthUser): string {
  if (!caller.vendorId) throw new ForbiddenException('Your account is not linked to an active vendor');
  return caller.vendorId;
}

/**
 * Projects an Auditor may work in: their project assignments, and - when
 * the Auditor belongs to a vendor - only that vendor's projects.
 */
export function auditorProjectWhere(caller: AuthUser): Prisma.ProjectWhereInput {
  return {
    auditorAssignments: { some: { auditorId: caller.id } },
    ...(caller.vendorId ? vendorProjectWhere(caller.vendorId) : {}),
  };
}

// ─── cross-vendor consistency checks (writes) ─────────────────────

interface VendorLookupDb {
  vendorAssignment: {
    findFirst: (args: Prisma.VendorAssignmentFindFirstArgs) => Promise<{ vendorId: string } | null>;
  };
  project: { findUnique: (args: any) => Promise<any> };
  team: { findUnique: (args: any) => Promise<any> };
  auditorProjectAssignment: { findMany: (args: any) => Promise<any[]> };
}

/** A user's active vendor (Team Lead / Auditor), or null. */
export async function userVendorId(db: VendorLookupDb, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const row = await db.vendorAssignment.findFirst({ where: { userId, isActive: true }, select: { vendorId: true } });
  return row?.vendorId ?? null;
}

/** A team's vendor = its Team Lead's active vendor. */
export async function teamVendorId(db: VendorLookupDb, teamId: string | null | undefined): Promise<string | null> {
  if (!teamId) return null;
  const team = await db.team.findUnique({ where: { id: teamId }, select: { teamLeadId: true } });
  return userVendorId(db, team?.teamLeadId ?? null);
}

export async function projectVendorId(db: VendorLookupDb, projectId: string): Promise<string | null> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { teamId: true } });
  return teamVendorId(db, project?.teamId ?? null);
}

const vendorLabel = (id: string | null) => (id ? 'another vendor' : 'no vendor');

/**
 * Rejects when any Auditor assigned to these projects belongs to a vendor
 * other than `vendorId`. Unassigned (in-house) Auditors never conflict.
 * Used whenever a project's vendor could change (team change, Team Lead
 * vendor assignment, Team Lead team change).
 */
export async function assertProjectAuditorsFit(
  db: VendorLookupDb,
  projectIds: string[],
  vendorId: string | null,
  context: string,
): Promise<void> {
  if (projectIds.length === 0) return;
  const assignments = await db.auditorProjectAssignment.findMany({
    where: { projectId: { in: projectIds } },
    select: {
      project: { select: { name: true } },
      auditor: {
        select: { fullName: true, loginName: true, vendorAssignments: { where: { isActive: true }, select: { vendorId: true }, take: 1 } },
      },
    },
  });
  const conflicts = assignments.filter((a) => {
    const v = a.auditor.vendorAssignments?.[0]?.vendorId ?? null;
    return v !== null && v !== vendorId;
  });
  if (conflicts.length) {
    const list = conflicts.map((c) => `${c.auditor.fullName ?? c.auditor.loginName} on ${c.project.name}`).join(', ');
    throw new ConflictException(
      `${context}: Auditor(s) from a different vendor are assigned to affected project(s) (${list}). Remove those assignments first - cross-vendor access is not allowed.`,
    );
  }
}

/** An Auditor's vendor must match the project's vendor (in-house Auditors may audit any project). */
export async function assertAuditorFitsProject(db: VendorLookupDb, auditorId: string, projectId: string): Promise<void> {
  const auditorVendor = await userVendorId(db, auditorId);
  if (!auditorVendor) return;
  const projectVendor = await projectVendorId(db, projectId);
  if (projectVendor !== auditorVendor) {
    throw new ConflictException(
      `This Auditor belongs to a vendor and the project is in ${vendorLabel(projectVendor)}. Cross-vendor assignments are not allowed.`,
    );
  }
}
