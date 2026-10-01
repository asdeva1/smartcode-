import type { PersonRef } from './common';

/**
 * Phase 10A-10B — Client File Driven Chart Import Foundation
 * (docs/09-BUSINESS-RULES.md section 11). The client's "Allocation.xlsx"
 * workbook has exactly two sheets: "Raw" (the client source, imported
 * here) and "Summary" (the Manager's export/output format). Column names
 * below are preserved EXACTLY as the client sends them - never renamed -
 * at the import boundary. This phase imports Raw only; the Summary
 * export/output (and the Phase 10D Team-Lead-upload workflow that
 * resolves "Assigned to" against LoginNameAllocation) is explicitly
 * OUT OF SCOPE here - see docs/09-BUSINESS-RULES.md "Future work" -
 * deferred to Phase 10C/10D respectively. CHART_IMPORT_SUMMARY_HEADERS
 * below is kept only as a documented FUTURE CONTRACT for that later
 * phase's export, not something this phase implements or exposes via any
 * endpoint.
 */

export const CHART_IMPORT_RAW_HEADERS = [
  'ChartID',
  'PageCount',
  'PageBucket',
  'textbox9',
  'EventTypeName2',
  'High_Level_Status',
] as const;
export type ChartImportRawHeader = (typeof CHART_IMPORT_RAW_HEADERS)[number];

/**
 * FUTURE CONTRACT ONLY (Phase 10C) - the Manager's eventual Summary export
 * format: the Raw columns plus "Assigned to" (blank until Phase 10D) and
 * "Shift" (its source/business rule is not yet defined - see
 * docs/09-BUSINESS-RULES.md - and must not be invented or erased here).
 * Not used by any Phase 10A-10B endpoint; retained purely so the eventual
 * 10C export implements exactly this column order without re-deriving it.
 */
export const CHART_IMPORT_SUMMARY_HEADERS = [...CHART_IMPORT_RAW_HEADERS, 'Assigned to', 'Shift'] as const;

export const CHART_IMPORT_FILE_TYPES = ['CSV', 'XLSX'] as const;
export type ChartImportFileType = (typeof CHART_IMPORT_FILE_TYPES)[number];

export const CHART_IMPORT_STATUSES = ['PENDING', 'COMPLETED', 'FAILED', 'REJECTED'] as const;
export type ChartImportStatus = (typeof CHART_IMPORT_STATUSES)[number];

/** CSV is capped by common.ts's CSV_IMPORT_MAX_*; chart imports can be much larger client workbooks. */
export const CHART_IMPORT_MAX_BYTES = 15 * 1024 * 1024;
export const CHART_IMPORT_MAX_ROWS = 20_000;

/**
 * Row-level validation result - same shape as the existing generic
 * ImportRowResult, reused rather than duplicated.
 *
 * 'duplicate' semantics (CORRECTED per architecture review): when a
 * ChartID appears more than once in the SAME uploaded file, EVERY row that
 * shares it is marked 'duplicate' - not just the later occurrence(s) - and
 * NONE of them are imported. SmartCode has no business rule authorizing it
 * to silently pick one occurrence as correct when duplicate rows disagree
 * on PageCount or any other value, so it picks none; the Manager must
 * correct the file and re-upload.
 */
export type ChartImportRowStatus = 'valid' | 'invalid' | 'duplicate';

export interface ChartImportRowResult {
  rowNumber: number;
  status: ChartImportRowStatus;
  errors: string[];
  data: Record<string, string>;
}

export interface ChartImportPreviewResponse {
  fileName: string;
  fileType: ChartImportFileType;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  /** Rows whose ChartID already belongs to this same Project - will be updated, not inserted, at commit. Included for Manager visibility; not a separate row status. */
  existingInProjectRows: number;
  rows: ChartImportRowResult[];
}

export interface ChartImportCommitResponse {
  id: string;
  fileName: string;
  status: ChartImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  successRows: number;
  failedRows: number;
  created: number;
  updated: number;
  rows: ChartImportRowResult[];
}

export interface ChartImportHistoryRow {
  id: string;
  fileName: string;
  fileType: ChartImportFileType;
  status: ChartImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  successRows: number;
  failedRows: number;
  importedAt: string;
  importedBy: PersonRef | null;
  templateVersion: { id: string; version: number } | null;
}

export interface ChartImportHistoryListResponse {
  data: ChartImportHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChartImportHistoryDetail extends ChartImportHistoryRow {
  errorSummary: string[] | null;
}
