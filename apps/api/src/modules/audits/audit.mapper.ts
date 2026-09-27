import type { Prisma } from '@prisma/client';
import { PERSON_SELECT, PROJECT_SELECT, isoDay, personRef, projectRef } from '../../common/scope';

export const AUDIT_INCLUDE = {
  auditor: { select: PERSON_SELECT },
  productionEntry: {
    select: {
      version: true,
      coder: { select: PERSON_SELECT },
      chart: { select: { project: { select: PROJECT_SELECT } } },
    },
  },
} as const;

export type AuditRow = Prisma.AuditEntryGetPayload<{ include: typeof AUDIT_INCLUDE }>;

/**
 * Coder identity and project are read through the linked ProductionEntry -
 * AuditEntry stores no copy of production data (docs/09-BUSINESS-RULES.md).
 */
export function toAuditDto(a: AuditRow) {
  return {
    id: a.id,
    chartId: a.chartId,
    productionEntryId: a.productionEntryId,
    productionVersion: a.productionEntry.version,
    auditErrors: a.auditErrors,
    errorExceptions: a.errorExceptions,
    totalErrors: a.totalErrors,
    status: a.status,
    auditDate: isoDay(a.auditDate),
    remarks: a.remarks,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    auditor: personRef(a.auditor),
    coder: personRef(a.productionEntry.coder),
    project: projectRef(a.productionEntry.chart?.project ?? null),
  };
}

export const AUDIT_EXPORT_COLUMNS = [
  { key: 'chartId', label: 'Chart ID' },
  { key: 'version', label: 'Production Version', numeric: true },
  { key: 'project', label: 'Project' },
  { key: 'coderName', label: 'Coder Name' },
  { key: 'coderEmployeeId', label: 'Coder Employee ID' },
  { key: 'coderLoginName', label: 'Coder Login Name' },
  { key: 'auditorName', label: 'Auditor' },
  { key: 'auditErrors', label: 'Audit Errors', numeric: true },
  { key: 'errorExceptions', label: 'Error Exceptions', numeric: true },
  { key: 'totalErrors', label: 'Total Errors', numeric: true },
  { key: 'status', label: 'Status' },
  { key: 'auditDate', label: 'Audit Date' },
  { key: 'remarks', label: 'Remarks' },
];

export function auditExportRow(a: AuditRow) {
  return {
    chartId: a.chartId,
    version: a.productionEntry.version,
    project: a.productionEntry.chart?.project?.name ?? '',
    coderName: a.productionEntry.coder.fullName ?? '',
    coderEmployeeId: a.productionEntry.coder.employeeId,
    coderLoginName: a.productionEntry.coder.loginName,
    auditorName: a.auditor.fullName ?? a.auditor.loginName,
    auditErrors: a.auditErrors,
    errorExceptions: a.errorExceptions,
    totalErrors: a.totalErrors,
    status: a.status,
    auditDate: isoDay(a.auditDate),
    remarks: a.remarks ?? '',
  };
}
