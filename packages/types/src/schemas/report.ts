import type { Role } from '../roles';

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
};

export interface ReportColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export type ReportCell = string | number | null;

export interface ReportResponse {
  report: ReportKey;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  generatedAt: string;
  filters: { from: string | null; to: string | null };
}

export interface DashboardSummary {
  role: Role;
  metrics: { key: string; label: string; value: number }[];
}
