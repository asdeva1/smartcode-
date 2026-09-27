import type { Role } from '../roles';
import type { ReportGrouping, ReportPeriod } from '../period';

/**
 * Foundational reports built from existing Production/Audit data only.
 * No CPH figure is produced (there is no hours data or formula
 * configuration yet - docs/09-BUSINESS-RULES.md "Productivity / CPH").
 */
export const REPORT_KEYS = [
  'production-summary',
  'coder-productivity',
  'production-detail',
  'audit-summary',
  'auditor-productivity',
  'error-summary',
  'assigned-charts',
  'audit-detail',
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_TITLES: Record<ReportKey, string> = {
  'production-summary': 'Production Status Summary',
  'coder-productivity': 'Coder Productivity',
  'production-detail': 'Production Detail',
  'audit-summary': 'Audit Status Summary',
  'auditor-productivity': 'Auditor Productivity',
  'error-summary': 'Error Summary',
  'assigned-charts': 'Assigned / Completed Charts',
  'audit-detail': 'Audit Detail',
};

export const REPORTS_BY_ROLE: Record<Role, ReportKey[]> = {
  MANAGER: [
    'production-summary',
    'audit-summary',
    'coder-productivity',
    'auditor-productivity',
    'error-summary',
    'production-detail',
    'audit-detail',
  ],
  TEAM_LEAD: ['production-summary', 'coder-productivity', 'audit-summary', 'error-summary', 'production-detail', 'audit-detail'],
  CODER: ['production-summary', 'coder-productivity', 'production-detail'],
  AUDITOR: ['audit-summary', 'auditor-productivity', 'error-summary', 'assigned-charts', 'audit-detail'],
  // Vendor sees the Manager's reporting areas, always limited to its own vendor scope.
  VENDOR: [
    'production-summary',
    'audit-summary',
    'coder-productivity',
    'auditor-productivity',
    'error-summary',
    'production-detail',
    'audit-detail',
  ],
};

/**
 * Report ownership. Detailed report templates are supplied later; for now
 * every existing report belongs to one of the two internal report families
 * and each family has an owning (generating) role. Other permitted roles
 * view the family inside their own scope. Adding a template later means
 * adding report keys to a family - the ownership/filtering stays as is.
 */
export const REPORT_FAMILIES = ['INTERNAL_PRODUCTION', 'INTERNAL_AUDIT'] as const;
export type ReportFamily = (typeof REPORT_FAMILIES)[number];

export const REPORT_FAMILY_INFO: Record<ReportFamily, { title: string; owner: Role }> = {
  INTERNAL_PRODUCTION: { title: 'Internal Production Report', owner: 'TEAM_LEAD' },
  INTERNAL_AUDIT: { title: 'Internal Audit Report', owner: 'AUDITOR' },
};

export const REPORT_FAMILY_OF: Record<ReportKey, ReportFamily> = {
  'production-summary': 'INTERNAL_PRODUCTION',
  'coder-productivity': 'INTERNAL_PRODUCTION',
  'production-detail': 'INTERNAL_PRODUCTION',
  'audit-summary': 'INTERNAL_AUDIT',
  'auditor-productivity': 'INTERNAL_AUDIT',
  'error-summary': 'INTERNAL_AUDIT',
  'assigned-charts': 'INTERNAL_AUDIT',
  'audit-detail': 'INTERNAL_AUDIT',
};

/** 'owner' generates the family; 'viewer' sees it in scope; null = not available. Coders keep only their own existing reports. */
export function reportFamilyAccess(role: Role, family: ReportFamily): 'owner' | 'viewer' | null {
  if (role === 'CODER') return null;
  if (REPORT_FAMILY_INFO[family].owner === role) return 'owner';
  return REPORTS_BY_ROLE[role].some((k) => REPORT_FAMILY_OF[k] === family) ? 'viewer' : null;
}

/** Reports that support grouping by period. */
export const GROUPABLE_REPORTS: ReportKey[] = ['production-summary', 'audit-summary'];

/**
 * Report filters. Each is AND-ed with the caller's own scope, so a filter
 * can only narrow what the caller may already see; a filter a role is not
 * authorised to use is rejected (403) rather than silently ignored.
 */
export const REPORT_FILTER_KEYS = ['vendorId', 'teamLeadId', 'auditorId', 'teamId', 'projectId', 'coderId'] as const;
export type ReportFilterKey = (typeof REPORT_FILTER_KEYS)[number];

export const REPORT_FILTERS_BY_ROLE: Record<Role, ReportFilterKey[]> = {
  MANAGER: ['vendorId', 'teamLeadId', 'auditorId', 'teamId', 'projectId'],
  TEAM_LEAD: ['coderId', 'projectId'],
  AUDITOR: ['projectId'],
  VENDOR: ['teamId', 'teamLeadId', 'auditorId', 'projectId'],
  CODER: [],
};

export interface ReportQuery {
  period?: ReportPeriod;
  today?: string;
  from?: string;
  to?: string;
  groupBy?: ReportGrouping;
  vendorId?: string;
  teamLeadId?: string;
  auditorId?: string;
  teamId?: string;
  projectId?: string;
  coderId?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export type ReportCell = string | number | null;

export interface ReportResponse {
  report: ReportKey;
  title: string;
  family: ReportFamily;
  familyTitle: string;
  ownerRole: Role;
  access: 'owner' | 'viewer';
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  generatedAt: string;
  /** from/to always echoed (the resolved range); other keys only when used. */
  filters: {
    from: string | null;
    to: string | null;
    period?: ReportPeriod;
    groupBy?: ReportGrouping;
  } & Partial<Record<ReportFilterKey, string>>;
}

export interface DashboardSummary {
  role: Role;
  metrics: { key: string; label: string; value: number }[];
  /** Vendor dashboards: the vendor and the current-period window used for "This Month" figures. */
  vendor?: { id: string; name: string; code: string; isActive: boolean };
  period?: { key: string; from: string; to: string };
}

export interface VendorOverviewRow {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  teamLeads: number;
  auditors: number;
  coders: number;
  productionCompleted: number;
  auditsCompleted: number;
  pendingRework: number;
}
