/**
 * Status enums — finalized per docs/11-SCHEMA-DECISIONS.md.
 * Single source of truth for the Prisma enum, backend validation,
 * and every StatusBadge in the UI. Do not diverge these lists
 * from the Prisma schema (prisma/schema.prisma) without updating
 * both together.
 */

export const PRODUCTION_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'REWORK',
  'CANCELLED',
] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export const AUDIT_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'REVIEW_REQUIRED',
  'REJECTED',
] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

/**
 * Allowed status transitions — see docs/09-BUSINESS-RULES.md
 * "Production Rework" and "Audit Resolution & Re-audit" sections.
 * Enforced server-side; the frontend uses this only to decide
 * which action buttons to show.
 */
export const PRODUCTION_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: ['REWORK'],
  REWORK: ['IN_PROGRESS'],
  CANCELLED: [],
};

export const AUDIT_TRANSITIONS: Record<AuditStatus, AuditStatus[]> = {
  PENDING: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED', 'REVIEW_REQUIRED', 'REJECTED'],
  REVIEW_REQUIRED: ['COMPLETED', 'REJECTED'],
  COMPLETED: [],
  REJECTED: [],
};
