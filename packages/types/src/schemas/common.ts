import { z } from 'zod';

/** Upper bound for count fields - rejects obviously corrupt input without constraining real work. */
export const MAX_COUNT = 100_000;

/** Allowed Chart ID characters: letters, digits, dot, dash, underscore. */
export const CHART_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export const ChartIdSchema = z
  .string()
  .trim()
  .min(1, 'Chart ID is required')
  .max(64, 'Chart ID must be at most 64 characters')
  .regex(CHART_ID_PATTERN, 'Chart ID may only contain letters, numbers, ".", "-" and "_"');

/**
 * Calendar date as YYYY-MM-DD. "Not in the future" allows one day beyond
 * the current UTC date so a user ahead of UTC (e.g. IST) can always enter
 * their own local "today". The backend applies the identical rule.
 */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isNotFutureDate(value: string, now: Date = new Date()): boolean {
  const limit = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return new Date(`${value}T00:00:00.000Z`).getTime() <= limit.getTime();
}

export const PastOrTodayDateSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine(isValidIsoDate, `${label} must be a valid date (YYYY-MM-DD)`)
    .refine((v) => !isValidIsoDate(v) || isNotFutureDate(v), `${label} cannot be in the future`);

export const countField = (label: string, min = 0) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, min === 0 ? `${label} cannot be negative` : `${label} must be at least ${min}`)
    .max(MAX_COUNT, `${label} must be at most ${MAX_COUNT}`);

export const RemarksSchema = z.string().trim().max(1000, 'Remarks must be at most 1000 characters').optional();

export interface PersonRef {
  id: string;
  fullName: string | null;
  employeeId: string;
  loginName: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** CSV import preview/commit contract shared by every CSV import. */
export type ImportRowStatus = 'valid' | 'invalid' | 'duplicate';

export interface ImportRowResult {
  rowNumber: number;
  status: ImportRowStatus;
  errors: string[];
  data: Record<string, string>;
}

export interface ImportPreviewResponse {
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: ImportRowResult[];
}

export interface ImportCommitResponse {
  fileName: string;
  imported: number;
  skipped: number;
  rows: ImportRowResult[];
}

export const EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Import is CSV only - never PDF or Excel. */
export const CSV_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_IMPORT_MAX_ROWS = 1000;
