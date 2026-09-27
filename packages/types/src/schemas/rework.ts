import { z } from 'zod';
import type { AuditStatus, ProductionStatus } from '../status';
import { PastOrTodayDateSchema, RemarksSchema, countField, type PersonRef } from './common';
import type { ProjectRef } from './production';

/**
 * Rework workflow (docs/09-BUSINESS-RULES.md "Production Rework"):
 *
 *   Auditor records "Rework" (audit status REJECTED) with a reason
 *     -> Rework OPEN, Coder + Team Lead notified
 *   Coder starts the rework (new production version in REWORK)
 *     -> IN_PROGRESS
 *   Coder completes the corrected version (or uses "Resolve rework")
 *     -> RESOLVED, Team Lead + Auditor notified, chart re-enters the
 *        Auditor's queue as a re-audit
 *   An audit is recorded on the corrected version
 *     -> REAUDITED
 *   A re-audit of the SAME version overturns the rejection
 *     -> WITHDRAWN
 *
 * The rejected audit and the audited production version are never
 * modified - the Rework row only links them.
 */
export const REWORK_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REAUDITED', 'WITHDRAWN'] as const;
export type ReworkStatus = (typeof REWORK_STATUSES)[number];

/** Statuses that still need the Coder's action. */
export const REWORK_PENDING_STATUSES: ReworkStatus[] = ['OPEN', 'IN_PROGRESS'];

export const REWORK_STATUS_LABELS: Record<ReworkStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved - awaiting re-audit',
  REAUDITED: 'Re-audited',
  WITHDRAWN: 'Withdrawn',
};

/** The Auditor must explain why a chart goes back for rework. */
export const ReworkReasonSchema = z
  .string()
  .trim()
  .min(3, 'Enter the rework reason in Remarks (at least 3 characters)')
  .max(1000, 'Rework reason must be at most 1000 characters');

/** Coder's corrected production values plus what was fixed. */
export const ResolveReworkSchema = z.object({
  pageCount: countField('Page count', 1),
  totalICDs: countField('Total ICDs'),
  totalDOS: countField('Total DOS'),
  codedDate: PastOrTodayDateSchema('Coded date'),
  remarks: RemarksSchema,
  resolutionNote: z
    .string()
    .trim()
    .min(3, 'Describe what was corrected (at least 3 characters)')
    .max(1000, 'Resolution details must be at most 1000 characters'),
});
export type ResolveReworkInput = z.infer<typeof ResolveReworkSchema>;

export interface Rework {
  id: string;
  chartId: string;
  status: ReworkStatus;
  reason: string;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  reauditedAt: string | null;
  coder: PersonRef;
  auditor: PersonRef;
  teamLead: PersonRef | null;
  resolvedBy: PersonRef | null;
  team: { id: string; name: string } | null;
  project: ProjectRef | null;
  audit: { id: string; status: AuditStatus; auditDate: string; totalErrors: number };
  originalProduction: { id: string; version: number; pageCount: number; totalICDs: number; totalDOS: number; codedDate: string; remarks: string | null };
  reworkProduction: { id: string; version: number; status: ProductionStatus } | null;
  /** The caller has an unread notification for this rework. */
  unread: boolean;
}

export interface ReworkListResponse {
  data: Rework[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReworkSummary {
  open: number;
  inProgress: number;
  resolved: number;
  reaudited: number;
  /** Rework items with an unread notification for the caller. */
  unread: number;
  /** Most recent pending (OPEN/IN_PROGRESS) and resolved items. */
  recent: Rework[];
}
