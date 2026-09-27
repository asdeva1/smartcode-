import { UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { resolveTeamId } from './resolve-team-id';

const ACTIVE_VENDOR = { where: { isActive: true }, select: { vendorId: true }, take: 1 } as const;

/**
 * Everything needed to build the session identity in ONE query: the team
 * a Team Lead leads, a Vendor account's vendor, a Team Lead's / Auditor's
 * active vendor assignment, and a Coder's Team Lead's active vendor
 * assignment. Used by login, refresh and the per-request JWT check so the
 * three can never disagree about scope.
 */
export const SESSION_USER_INCLUDE = {
  leadsTeam: { select: { id: true } },
  vendor: { select: { id: true, isActive: true } },
  vendorAssignments: ACTIVE_VENDOR,
  team: { select: { teamLead: { select: { vendorAssignments: ACTIVE_VENDOR } } } },
} as const;

export interface SessionUserRow {
  id: string;
  employeeId: string;
  loginName: string;
  email: string;
  fullName?: string | null;
  role: string;
  teamId: string | null;
  isActive: boolean;
  passwordChangedAt?: Date | null;
  leadsTeam?: { id: string } | null;
  vendorId?: string | null;
  vendor?: { id: string; isActive: boolean } | null;
  vendorAssignments?: { vendorId: string }[];
  team?: { teamLead: { vendorAssignments?: { vendorId: string }[] } | null } | null;
}

/**
 * The vendor whose scope the caller operates in (null = no vendor):
 * VENDOR account -> its own vendor; TEAM_LEAD / AUDITOR -> their single
 * active assignment; CODER -> their Team Lead's assignment (a Coder
 * belongs to the vendor through their team). Managers are global.
 */
export function resolveVendorId(user: SessionUserRow): string | null {
  switch (user.role) {
    case 'VENDOR':
      return user.vendorId ?? null;
    case 'TEAM_LEAD':
    case 'AUDITOR':
      return user.vendorAssignments?.[0]?.vendorId ?? null;
    case 'CODER':
      return user.team?.teamLead?.vendorAssignments?.[0]?.vendorId ?? null;
    default:
      return null;
  }
}

/**
 * A Vendor login is only valid while it is linked to an ACTIVE vendor -
 * deactivating a vendor locks its accounts out immediately (the check
 * runs on every request, not just at login).
 */
export function assertVendorAccountUsable(user: SessionUserRow) {
  if (user.role !== 'VENDOR') return;
  if (!user.vendorId || !user.vendor || !user.vendor.isActive) {
    throw new UnauthorizedException('This vendor account is not active. Contact your Manager.');
  }
}

export function toSessionUser(user: SessionUserRow): AuthUser {
  return {
    id: user.id,
    employeeId: user.employeeId,
    loginName: user.loginName,
    email: user.email,
    fullName: user.fullName ?? null,
    role: user.role as AuthUser['role'],
    teamId: resolveTeamId(user),
    vendorId: resolveVendorId(user),
    isActive: user.isActive,
  };
}

/**
 * Tokens carry `pwd` = the password-change stamp at issue time. After a
 * password change every earlier token (including ones issued before this
 * claim existed, which have no `pwd`) no longer matches and is rejected.
 */
export function passwordStamp(changedAt: Date | null | undefined): number {
  return changedAt ? changedAt.getTime() : 0;
}

export function tokenMatchesPassword(payload: { pwd?: unknown }, changedAt: Date | null | undefined): boolean {
  const claim = typeof payload.pwd === 'number' ? payload.pwd : 0;
  return claim === passwordStamp(changedAt);
}
