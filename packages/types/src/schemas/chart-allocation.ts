import { z } from 'zod';
import type { PersonRef } from './common';

/**
 * Phase 10D — Chart Allocation (docs/09-BUSINESS-RULES.md section 12).
 *
 * The Manager exports a filtered "Summary" workbook/CSV of a MANUAL
 * project's charts: the exact client Raw columns (never renamed, per the
 * same rule chart-import.ts already follows for the Raw sheet), plus a
 * blank "Assigned to" column and a fixed "Shift 1" column. The Team Lead
 * fills in "Assigned to" with a Coder's Login Name and re-uploads it;
 * SmartCode validates every row and, only if the whole file is valid,
 * commits one ChartAllocation row per Chart in a single transaction -
 * same all-or-nothing shape as the existing client chart import
 * (chart-import.ts), reused deliberately rather than re-derived.
 *
 * This supersedes chart-import.ts's own CHART_IMPORT_SUMMARY_HEADERS
 * placeholder, which pre-dated this phase and used an undefined "Shift"
 * column name - that constant is left in place there (unused, historical)
 * rather than deleted, since it is not wired into any endpoint; this file
 * is the real, implemented contract.
 */

export const CHART_ALLOCATION_SUMMARY_HEADERS = [
  'ChartID',
  'PageCount',
  'PageBucket',
  'textbox9',
  'EventTypeName2',
  'High_Level_Status',
  'Assigned to',
  'Shift 1',
] as const;
export type ChartAllocationSummaryHeader = (typeof CHART_ALLOCATION_SUMMARY_HEADERS)[number];

/** The Team Lead's re-upload must use a sheet literally named "Summary" (XLSX) - mirrors chart-import.ts's "Raw"-sheet-only rule; no silent fallback to any other sheet. */
export const CHART_ALLOCATION_SUMMARY_SHEET_NAME = 'Summary';

/** The fixed value every export writes into the "Shift 1" column - see docs/09-BUSINESS-RULES.md section 12; there is only one shift value defined for Phase 10D. */
export const CHART_ALLOCATION_SHIFT_VALUE = 'Shift 1';

export const CHART_ALLOCATION_FILE_TYPES = ['CSV', 'XLSX'] as const;
export type ChartAllocationFileType = (typeof CHART_ALLOCATION_FILE_TYPES)[number];

export const CHART_ALLOCATION_IMPORT_STATUSES = ['PENDING', 'COMPLETED', 'FAILED', 'REJECTED'] as const;
export type ChartAllocationImportStatus = (typeof CHART_ALLOCATION_IMPORT_STATUSES)[number];

/** Same byte/row caps as chart-import.ts, reused rather than re-derived - a Summary file is a subset of the same client-sized workbook. */
export const CHART_ALLOCATION_MAX_BYTES = 15 * 1024 * 1024;
export const CHART_ALLOCATION_MAX_ROWS = 20_000;

export type ChartAllocationRowStatus = 'valid' | 'invalid' | 'duplicate';

export interface ChartAllocationRowResult {
  rowNumber: number;
  status: ChartAllocationRowStatus;
  errors: string[];
  chartId: string;
  loginName: string;
}

export interface ChartAllocationPreviewResponse {
  fileName: string;
  fileType: ChartAllocationFileType;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: ChartAllocationRowResult[];
}

export interface ChartAllocationCommitResponse {
  id: string;
  fileName: string;
  status: ChartAllocationImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  successRows: number;
  failedRows: number;
  rows: ChartAllocationRowResult[];
}

export interface ChartAllocationHistoryRow {
  id: string;
  chartId: string;
  projectId: string;
  coder: PersonRef;
  loginNameSnapshot: string;
  team: { id: string; name: string } | null;
  teamLead: PersonRef | null;
  assignedBy: PersonRef | null;
  assignedAt: string;
  isActive: boolean;
  endedAt: string | null;
  endedBy: PersonRef | null;
  endReason: 'PULLED_BACK' | 'REASSIGNED' | null;
  endNote: string | null;
  previousAllocationId: string | null;
}

export interface ChartAllocationHistoryListResponse {
  data: ChartAllocationHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChartAllocationImportHistoryRow {
  id: string;
  fileName: string;
  fileType: ChartAllocationFileType;
  status: ChartAllocationImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  successRows: number;
  failedRows: number;
  importedAt: string;
  importedBy: PersonRef | null;
}

export interface ChartAllocationListRow {
  chartId: string;
  pageCount: number | null;
  pageBucket: string | null;
  textbox9: string | null;
  eventTypeName2: string | null;
  highLevelStatus: string | null;
  assignedCoder: PersonRef | null;
  assignedAt: string | null;
  productionStatus: string | null;
}

export interface ChartAllocationListResponse {
  data: ChartAllocationListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const ReassignChartAllocationSchema = z.object({
  loginName: z.string().trim().min(1, 'Login Name is required'),
});
export type ReassignChartAllocationInput = z.infer<typeof ReassignChartAllocationSchema>;

export const PullbackChartAllocationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type PullbackChartAllocationInput = z.infer<typeof PullbackChartAllocationSchema>;

/** Raw counts only (docs/09-BUSINESS-RULES.md section 12 explicitly forbids inventing a production-percentage formula) - allocated/done/pending per the actual database state. */
export interface ChartAllocationMetrics {
  allocated: number;
  done: number;
  pending: number;
  byCoder: Array<{ coder: PersonRef; allocated: number; done: number; pending: number }>;
}
