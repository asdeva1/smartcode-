import { z } from 'zod';
import type { AuditStatus, ProductionStatus } from '../status';
import { ChartIdSchema, PastOrTodayDateSchema, RemarksSchema, countField, type PersonRef } from './common';
import type { ProjectRef } from './production';

/** Statuses an Auditor may record. PENDING is omitted - "Save" records IN_PROGRESS. */
export const AUDIT_ENTRY_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'REVIEW_REQUIRED', 'REJECTED'] as const;

/**
 * Total Errors = Audit Errors + Error Exceptions, always recomputed by the
 * backend. A client may echo `totalErrors` for display; if it does, the
 * backend rejects a value that doesn't match its own calculation.
 */
export function calculateTotalErrors(auditErrors: number, errorExceptions: number): number {
  return auditErrors + errorExceptions;
}

const auditFields = {
  auditErrors: countField('Audit errors'),
  errorExceptions: countField('Error exceptions'),
  status: z.enum(AUDIT_ENTRY_STATUSES, { errorMap: () => ({ message: 'Select a valid status' }) }),
  auditDate: PastOrTodayDateSchema('Audit date'),
  remarks: RemarksSchema,
  totalErrors: z.coerce.number().int().optional(),
};

/** Auditor enters only the Chart ID and audit fields - production data is retrieved, never re-entered. */
export const CreateAuditSchema = z.object({ chartId: ChartIdSchema, ...auditFields });
export type CreateAuditInput = z.infer<typeof CreateAuditSchema>;

export const UpdateAuditSchema = z.object({
  auditErrors: auditFields.auditErrors.optional(),
  errorExceptions: auditFields.errorExceptions.optional(),
  status: auditFields.status.optional(),
  auditDate: PastOrTodayDateSchema('Audit date').optional(),
  remarks: RemarksSchema,
  totalErrors: auditFields.totalErrors,
});
export type UpdateAuditInput = z.infer<typeof UpdateAuditSchema>;

/** Re-audit of a REJECTED audit: a new row against the same production version. */
export const ReauditSchema = z.object(auditFields);
export type ReauditInput = z.infer<typeof ReauditSchema>;

export const ResolveAuditSchema = z.object({
  status: z.enum(['COMPLETED', 'REJECTED'], { errorMap: () => ({ message: 'Choose Completed or Rejected' }) }),
  remarks: RemarksSchema,
});
export type ResolveAuditInput = z.infer<typeof ResolveAuditSchema>;

export interface AuditEntry {
  id: string;
  chartId: string;
  productionEntryId: string;
  productionVersion: number;
  auditErrors: number;
  errorExceptions: number;
  totalErrors: number;
  status: AuditStatus;
  auditDate: string;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  auditor: PersonRef;
  coder: PersonRef;
  project: ProjectRef | null;
}

export interface AuditListResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/** Read-only production data the Auditor sees after entering a Chart ID. */
export interface ChartProductionLookup {
  chartId: string;
  project: ProjectRef | null;
  production: {
    id: string;
    version: number;
    pageCount: number;
    totalDOS: number;
    totalICDs: number;
    codedDate: string;
    status: ProductionStatus;
    coder: PersonRef;
  };
  audits: AuditEntry[];
  /** Whether a new audit can be created for the current version, and why not if not. */
  canAudit: boolean;
  reason: string | null;
  /** The caller's own open (PENDING/IN_PROGRESS) audit on this version, if any. */
  openAuditId: string | null;
  /** The latest audit on this version if it is REJECTED - the re-audit target. */
  reauditTargetId: string | null;
}

export type AuditQueueState = 'PENDING_AUDIT' | 'IN_PROGRESS';

export interface AuditQueueItem {
  chartId: string;
  project: ProjectRef | null;
  version: number;
  pageCount: number;
  totalDOS: number;
  totalICDs: number;
  codedDate: string;
  productionStatus: ProductionStatus;
  coder: PersonRef;
  queueState: AuditQueueState;
  myAuditId: string | null;
  isReaudit: boolean;
}

export interface AuditQueueResponse {
  data: AuditQueueItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const AUDIT_IMPORT_HEADERS = [
  'chartId',
  'auditErrors',
  'errorExceptions',
  'status',
  'auditDate',
  'remarks',
] as const;
