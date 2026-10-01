import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { CHART_IMPORT_MAX_BYTES, CHART_IMPORT_MAX_ROWS, CHART_IMPORT_RAW_HEADERS, type ChartImportFileType } from '@smartcode/types';
import { CsvParseError, parseCsv } from '../csv/csv';

/** The subset of Multer's file object the import endpoints rely on. */
export interface UploadedChartImportFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ReadChartImportResult {
  fileName: string;
  fileType: ChartImportFileType;
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

/** Multer limits for chart import endpoints - larger than the generic CSV_UPLOAD_LIMITS since client workbooks are much bigger. */
export const CHART_IMPORT_UPLOAD_LIMITS = { fileSize: CHART_IMPORT_MAX_BYTES, files: 1 };

const RAW_SHEET_NAME = 'Raw';

function validateHeaders(headers: string[], fileLabel: string): void {
  // Client column names are preserved and matched EXACTLY (case-sensitive,
  // no reordering assumptions beyond position-independent matching) - see
  // docs/09-BUSINESS-RULES.md section 11. Never renamed, never reinterpreted.
  const missing = CHART_IMPORT_RAW_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new BadRequestException(
      `${fileLabel} is missing required column(s): ${missing.join(', ')}. Expected exactly: ${CHART_IMPORT_RAW_HEADERS.join(', ')}`,
    );
  }
  const unknown = headers.filter((h) => !(CHART_IMPORT_RAW_HEADERS as readonly string[]).includes(h));
  if (unknown.length > 0) {
    throw new BadRequestException(`${fileLabel} has unknown column(s): ${unknown.join(', ')}. Expected exactly: ${CHART_IMPORT_RAW_HEADERS.join(', ')}`);
  }
  const dupes = headers.filter((h, i) => headers.indexOf(h) !== i);
  if (dupes.length > 0) throw new BadRequestException(`${fileLabel} has duplicate column(s): ${[...new Set(dupes)].join(', ')}`);
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    // Rich text / formula result / hyperlink cell - take its best textual representation.
    if ('text' in value && typeof (value as { text?: unknown }).text === 'string') return (value as { text: string }).text;
    if ('result' in value) return cellToString((value as { result: ExcelJS.CellValue }).result);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return '';
  }
  return String(value).trim();
}

async function readXlsxWorkbookAsync(buffer: Buffer, fileName: string): Promise<ReadChartImportResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('Could not read this Excel file - it may be corrupted or in an unsupported format (only .xlsx is supported, not legacy .xls)');
  }
  // Do NOT silently fall back to "Summary" (or any other sheet) when "Raw"
  // is missing - Raw is explicitly the client source sheet for this import.
  const sheet = workbook.getWorksheet(RAW_SHEET_NAME);
  if (!sheet) {
    const found = workbook.worksheets.map((w) => w.name).join(', ') || '(none)';
    throw new BadRequestException(`This workbook has no "${RAW_SHEET_NAME}" sheet (found: ${found}). Import requires the client's "${RAW_SHEET_NAME}" sheet, not "Summary".`);
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => headers.push(cellToString(cell.value)));
  validateHeaders(headers, `The "${RAW_SHEET_NAME}" sheet`);

  const index = CHART_IMPORT_RAW_HEADERS.map((h) => headers.indexOf(h));
  const rows: string[][] = [];
  const lastRow = sheet.actualRowCount ?? sheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const values = index.map((i) => (i >= 0 ? cellToString(row.getCell(i + 1).value) : ''));
    if (values.every((v) => v === '')) continue; // skip fully empty rows
    rows.push(values);
  }
  if (rows.length === 0) throw new BadRequestException(`The "${RAW_SHEET_NAME}" sheet has a header row but no data rows`);
  if (rows.length > CHART_IMPORT_MAX_ROWS) {
    throw new BadRequestException(`Too many rows (${rows.length}); the maximum per import is ${CHART_IMPORT_MAX_ROWS}`);
  }
  return { fileName, fileType: 'XLSX', headers: [...CHART_IMPORT_RAW_HEADERS], rows };
}

function readCsv(file: UploadedChartImportFile): ReadChartImportResult {
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
  const index = CHART_IMPORT_RAW_HEADERS.map((h) => parsed.headers.indexOf(h));
  const rows = parsed.rows.map((r) => index.map((i) => (i >= 0 ? (r[i] ?? '').trim() : '')));
  if (rows.length === 0) throw new BadRequestException('The CSV has a header row but no data rows');
  if (rows.length > CHART_IMPORT_MAX_ROWS) {
    throw new BadRequestException(`Too many rows (${rows.length}); the maximum per import is ${CHART_IMPORT_MAX_ROWS}`);
  }
  return { fileName: file.originalname ?? 'upload.csv', fileType: 'CSV', headers: [...CHART_IMPORT_RAW_HEADERS], rows };
}

/**
 * Validates extension/MIME/size, detects CSV vs Excel, and parses. Unlike
 * the Coder CSV importer, this one accepts BOTH file types because the
 * client's own "Allocation.xlsx" workbook is Excel (see
 * docs/09-BUSINESS-RULES.md section 11). Legacy binary .xls is explicitly
 * NOT supported (ExcelJS/the existing stack has no .xls reader) - this is
 * disclosed as a known limitation rather than silently mis-parsed.
 */
export async function readChartImportUpload(file: UploadedChartImportFile | undefined): Promise<ReadChartImportResult> {
  if (!file) throw new BadRequestException('Attach a CSV or Excel (.xlsx) file in the "file" field');
  const fileName = file.originalname ?? 'upload';
  if (file.size > CHART_IMPORT_MAX_BYTES) {
    throw new BadRequestException(`File is too large (max ${CHART_IMPORT_MAX_BYTES / 1024 / 1024} MB)`);
  }
  if (file.size === 0) throw new BadRequestException('The uploaded file is empty');

  const isXlsxExt = /\.xlsx$/i.test(fileName);
  const isXlsExt = /\.xls$/i.test(fileName);
  const isCsvExt = /\.csv$/i.test(fileName);
  if (isXlsExt) {
    throw new BadRequestException('Legacy .xls files are not supported - save the workbook as .xlsx or export the Raw sheet as .csv');
  }
  if (!isXlsxExt && !isCsvExt) {
    throw new BadRequestException('Only .csv or .xlsx files can be imported');
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

  // .csv extension
  if (looksLikeZip || bytes.subarray(0, 4).toString() === '%PDF') {
    throw new BadRequestException('This file is not a CSV (it looks like an Excel or PDF file)');
  }
  if (!ACCEPTED_CSV_MIME_TYPES.has((file.mimetype ?? '').toLowerCase())) {
    throw new BadRequestException(`Unsupported file type "${file.mimetype}" - upload a CSV file`);
  }
  return readCsv(file);
}

/** Row objects keyed by canonical header, in the client's exact column-name form. */
export function toChartImportRecords(headers: readonly string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}
