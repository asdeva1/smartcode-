import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  CHART_ALLOCATION_MAX_BYTES,
  CHART_ALLOCATION_MAX_ROWS,
  CHART_ALLOCATION_SUMMARY_HEADERS,
  CHART_ALLOCATION_SUMMARY_SHEET_NAME,
  type ChartAllocationFileType,
} from '@smartcode/types';
import { CsvParseError, parseCsv, sanitizeCell, toCsv } from '../csv/csv';

/**
 * Phase 10D — Team Lead Summary upload parsing, and the Manager's Summary
 * export writer. Deliberately a SEPARATE file from
 * chart-import/chart-import-upload.ts (the client Raw-file importer) even
 * though the parsing shape is similar: the two have different fixed
 * header sets, different required sheet names ("Raw" vs "Summary"), and
 * are two independent workflows (Manager-authored client-file import vs
 * Team-Lead-authored allocation upload) - collapsing them into one
 * function would only make each harder to read for no shared benefit,
 * and the existing chart-imports.service.ts / ChartImport tables are left
 * completely untouched by this phase, per that requirement.
 */

/** The subset of Multer's file object the allocation endpoints rely on - identical shape to UploadedChartImportFile, kept separate to avoid a cross-module import for what is otherwise a coincidental type match. */
export interface UploadedChartAllocationFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ReadChartAllocationResult {
  fileName: string;
  fileType: ChartAllocationFileType;
  headers: string[];
  rows: string[][];
}

const ACCEPTED_CSV_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'text/x-csv',
  'application/x-csv',
  'text/comma-separated-values',
  'text/plain',
  'application/vnd.ms-excel',
  'application/octet-stream',
  '',
]);

const ACCEPTED_XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
  '',
]);

/** Multer limits for the allocation upload endpoints - same caps as the client chart importer (chart-import-upload.ts), reused rather than re-derived. */
export const CHART_ALLOCATION_UPLOAD_LIMITS = { fileSize: CHART_ALLOCATION_MAX_BYTES, files: 1 };

function validateHeaders(headers: string[], fileLabel: string): void {
  const missing = CHART_ALLOCATION_SUMMARY_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new BadRequestException(
      `${fileLabel} is missing required column(s): ${missing.join(', ')}. Expected exactly: ${CHART_ALLOCATION_SUMMARY_HEADERS.join(', ')}`,
    );
  }
  const unknown = headers.filter((h) => !(CHART_ALLOCATION_SUMMARY_HEADERS as readonly string[]).includes(h));
  if (unknown.length > 0) {
    throw new BadRequestException(`${fileLabel} has unknown column(s): ${unknown.join(', ')}. Expected exactly: ${CHART_ALLOCATION_SUMMARY_HEADERS.join(', ')}`);
  }
  const dupes = headers.filter((h, i) => headers.indexOf(h) !== i);
  if (dupes.length > 0) throw new BadRequestException(`${fileLabel} has duplicate column(s): ${[...new Set(dupes)].join(', ')}`);
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value && typeof (value as { text?: unknown }).text === 'string') return (value as { text: string }).text;
    if ('result' in value) return cellToString((value as { result: ExcelJS.CellValue }).result);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return '';
  }
  return String(value).trim();
}

async function readXlsxWorkbookAsync(buffer: Buffer, fileName: string): Promise<ReadChartAllocationResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('Could not read this Excel file - it may be corrupted or in an unsupported format (only .xlsx is supported, not legacy .xls)');
  }
  // No silent fallback to "Raw" (or any other sheet) - mirrors the client
  // Raw importer's own rule (chart-import-upload.ts), just for the
  // opposite sheet name.
  const sheet = workbook.getWorksheet(CHART_ALLOCATION_SUMMARY_SHEET_NAME);
  if (!sheet) {
    const found = workbook.worksheets.map((w) => w.name).join(', ') || '(none)';
    throw new BadRequestException(
      `This workbook has no "${CHART_ALLOCATION_SUMMARY_SHEET_NAME}" sheet (found: ${found}). Upload the Manager's exported Summary workbook, not the client's "Raw" file.`,
    );
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => headers.push(cellToString(cell.value)));
  validateHeaders(headers, `The "${CHART_ALLOCATION_SUMMARY_SHEET_NAME}" sheet`);

  const index = CHART_ALLOCATION_SUMMARY_HEADERS.map((h) => headers.indexOf(h));
  const rows: string[][] = [];
  const lastRow = sheet.actualRowCount ?? sheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const values = index.map((i) => (i >= 0 ? cellToString(row.getCell(i + 1).value) : ''));
    // A fully blank row is skipped here, same as the Raw importer -
    // "ChartID is required" (validateRows) is what rejects a row that is
    // present but missing its ChartID; a literally blank spacer row at
    // the end of the sheet is not a business row at all.
    if (values.every((v) => v === '')) continue;
    rows.push(values);
  }
  if (rows.length === 0) throw new BadRequestException(`The "${CHART_ALLOCATION_SUMMARY_SHEET_NAME}" sheet has a header row but no data rows`);
  if (rows.length > CHART_ALLOCATION_MAX_ROWS) {
    throw new BadRequestException(`Too many rows (${rows.length}); the maximum per allocation upload is ${CHART_ALLOCATION_MAX_ROWS}`);
  }
  return { fileName, fileType: 'XLSX', headers: [...CHART_ALLOCATION_SUMMARY_HEADERS], rows };
}

function readCsv(file: UploadedChartAllocationFile): ReadChartAllocationResult {
  const bytes = file.buffer;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new BadRequestException('The CSV must be UTF-8 encoded text');
  }
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (e) {
    throw new BadRequestException(e instanceof CsvParseError ? e.message : 'Could not parse the CSV file');
  }
  validateHeaders(parsed.headers, 'The CSV');
  const index = CHART_ALLOCATION_SUMMARY_HEADERS.map((h) => parsed.headers.indexOf(h));
  const rows = parsed.rows.map((r) => index.map((i) => (i >= 0 ? (r[i] ?? '').trim() : '')));
  if (rows.length === 0) throw new BadRequestException('The CSV has a header row but no data rows');
  if (rows.length > CHART_ALLOCATION_MAX_ROWS) {
    throw new BadRequestException(`Too many rows (${rows.length}); the maximum per allocation upload is ${CHART_ALLOCATION_MAX_ROWS}`);
  }
  return { fileName: file.originalname ?? 'summary.csv', fileType: 'CSV', headers: [...CHART_ALLOCATION_SUMMARY_HEADERS], rows };
}

/** Validates extension/MIME/size, detects CSV vs Excel, and parses - same detection logic as readChartImportUpload. */
export async function readChartAllocationUpload(file: UploadedChartAllocationFile | undefined): Promise<ReadChartAllocationResult> {
  if (!file) throw new BadRequestException('Attach the completed Summary CSV or Excel (.xlsx) file in the "file" field');
  const fileName = file.originalname ?? 'upload';
  if (file.size > CHART_ALLOCATION_MAX_BYTES) {
    throw new BadRequestException(`File is too large (max ${CHART_ALLOCATION_MAX_BYTES / 1024 / 1024} MB)`);
  }
  if (file.size === 0) throw new BadRequestException('The uploaded file is empty');

  const isXlsxExt = /\.xlsx$/i.test(fileName);
  const isXlsExt = /\.xls$/i.test(fileName);
  const isCsvExt = /\.csv$/i.test(fileName);
  if (isXlsExt) {
    throw new BadRequestException('Legacy .xls files are not supported - save the workbook as .xlsx or export the Summary sheet as .csv');
  }
  if (!isXlsxExt && !isCsvExt) {
    throw new BadRequestException('Only .csv or .xlsx files can be uploaded');
  }

  const bytes = file.buffer;
  const looksLikeZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

  if (isXlsxExt) {
    if (!ACCEPTED_XLSX_MIME_TYPES.has((file.mimetype ?? '').toLowerCase()) && !looksLikeZip) {
      throw new BadRequestException(`Unsupported file type "${file.mimetype}" for a .xlsx upload`);
    }
    if (!looksLikeZip) throw new BadRequestException('This file is not a valid Excel (.xlsx) file');
    return readXlsxWorkbookAsync(bytes, fileName);
  }

  if (looksLikeZip || bytes.subarray(0, 4).toString() === '%PDF') {
    throw new BadRequestException('This file is not a CSV (it looks like an Excel or PDF file)');
  }
  if (!ACCEPTED_CSV_MIME_TYPES.has((file.mimetype ?? '').toLowerCase())) {
    throw new BadRequestException(`Unsupported file type "${file.mimetype}" - upload a CSV file`);
  }
  return readCsv(file);
}

/** Row objects keyed by canonical header, in the client's exact column-name form (plus "Assigned to"/"Shift 1"). */
export function toChartAllocationRecords(headers: readonly string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

/** One row of the Manager's Summary export, in CHART_ALLOCATION_SUMMARY_HEADERS column order. */
export interface AllocationSummaryExportRow {
  chartId: string;
  pageCount: number | null;
  pageBucket: string | null;
  textbox9: string | null;
  eventTypeName2: string | null;
  highLevelStatus: string | null;
}

/**
 * Builds the Manager's Summary export file - the client Raw columns
 * (verbatim, from the latest applicable ChartImportRow per
 * ChartAllocationsService), a blank "Assigned to" column (per
 * docs/09-BUSINESS-RULES.md section 12: "Assigned to must be blank in
 * Manager export"), and a fixed "Shift 1" value in every row. This is a
 * dedicated writer rather than reuse of the generic
 * common/export/export.service.ts ExportService: that service always
 * prepends a title/generated-by/filters preamble (and, for XLSX, an
 * arbitrary sheet name) ahead of the header row, which would break the
 * "Summary" sheet-name and exact-header-row-1 contract the Team Lead's
 * re-upload (readChartAllocationUpload above) requires. This still reuses
 * the same underlying CSV/XLSX infrastructure (csv.ts's toCsv/
 * sanitizeCell, and ExcelJS directly) rather than a second library.
 */
export async function buildAllocationSummaryFile(fileType: ChartAllocationFileType, rows: AllocationSummaryExportRow[]): Promise<Buffer> {
  const values = rows.map((r) => [
    r.chartId,
    r.pageCount ?? '',
    r.pageBucket ?? '',
    r.textbox9 ?? '',
    r.eventTypeName2 ?? '',
    r.highLevelStatus ?? '',
    '', // Assigned to - always blank in the Manager's export
    'Shift 1',
  ]);
  if (fileType === 'CSV') {
    const body = toCsv([...CHART_ALLOCATION_SUMMARY_HEADERS], values);
    // BOM so Excel on Windows opens UTF-8 correctly - matches
    // ExportService's own CSV convention.
    return Buffer.from(`﻿${body}`, 'utf8');
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SmartCode';
  const ws = wb.addWorksheet(CHART_ALLOCATION_SUMMARY_SHEET_NAME);
  const header = ws.addRow([...CHART_ALLOCATION_SUMMARY_HEADERS]);
  header.font = { bold: true };
  for (const row of values) {
    ws.addRow(row.map((v) => (typeof v === 'number' ? v : sanitizeCell(v))));
  }
  CHART_ALLOCATION_SUMMARY_HEADERS.forEach((h, i) => {
    ws.getColumn(i + 1).width = Math.min(40, Math.max(12, h.length + 4));
  });
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
