import type { Role } from '../roles';

/**
 * Login Name Allocation history (docs/09-BUSINESS-RULES.md section 10 /
 * Phase 9) - an append-only ledger of who has held every Login Name, and
 * when. See apps/api/prisma/schema.prisma's LoginNameAllocation model for
 * the full invariants (one ACTIVE per loginName, one ACTIVE per user).
 */
export const LOGIN_NAME_ALLOCATION_STATUSES = ['ACTIVE', 'DEACTIVATED', 'REALLOCATED'] as const;
export type LoginNameAllocationStatus = (typeof LOGIN_NAME_ALLOCATION_STATUSES)[number];

export interface LoginNameAllocationPerson {
  id: string;
  fullName: string | null;
  employeeId: string;
  loginName: string;
}

/** The user's CURRENT org placement, joined live - not a point-in-time snapshot (see schema.prisma). */
export interface LoginNameAllocationUserRef {
  id: string;
  fullName: string | null;
  employeeId: string;
  loginName: string;
  role: Role;
  isActive: boolean;
  vendor: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  teamLead: { id: string; fullName: string | null; loginName: string } | null;
}

export interface LoginNameAllocationRow {
  id: string;
  loginName: string;
  employeeId: string;
  status: LoginNameAllocationStatus;
  allocatedAt: string;
  deallocatedAt: string | null;
  /** Null only for a pre-Phase-9 account created by the one-time INITIAL_BACKFILL script - no real allocator to record, never the account holder themselves or a fabricated Manager. */
  allocatedBy: LoginNameAllocationPerson | null;
  deallocatedBy: LoginNameAllocationPerson | null;
  reason: string | null;
  user: LoginNameAllocationUserRef;
}

export interface LoginNameAllocationListResponse {
  data: LoginNameAllocationRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LoginNameAllocationDetail {
  loginName: string;
  current: LoginNameAllocationRow | null;
  history: LoginNameAllocationRow[];
}
