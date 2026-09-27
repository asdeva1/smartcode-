import { BadRequestException } from '@nestjs/common';
import { CSV_IMPORT_MAX_BYTES, CSV_IMPORT_MAX_ROWS } from '@smartcode/types';
import { CsvParseError, parseCsv } from './csv';

/** The subset of Multer's file object the import endpoints rely on. */
export interface UploadedCsvFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Browsers report CSV inconsistently - Windows/Excel commonly sends
 * application/vnd.ms-excel for a .csv file. Anything outside this list
 * (e.g. a real .xlsx or a PDF renamed to .csv) is rejected.
 */
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

/** Multer limits for every CSV import endpoint. */
export const CSV_UPLOAD_LIMITS = { fileSize: CSV_IMPORT_MAX_BYTES, files: 1 };

export interface ReadCsvResult {
  fileName: string;
  headers: string[];
  rows: string[][];
}

/**
 * Validates extension, MIME type, size, encoding and header set, then
 * parses. Import is CSV-only by business rule - Excel/PDF are never
 * accepted, whatever their extension claims.
 */
export function readCsvUpload(
  file: UploadedCsvFile | undefined,
  expectedHeaders: readonly string[],
  requiredHeaders: readonly string[] = expectedHeaders,
): ReadCsvResult {
  if (!file) throw new BadRequestException('Attach a CSV file in the "file" field');
  const fileName = file.originalname ?? 'upload.csv';
  if (!/\.csv$/i.test(fileName)) {
    throw new BadRequestException('Only .csv files can be imported (Excel and PDF import are not supported)');
  }
  if (!ACCEPTED_CSV_MIME_TYPES.has((file.mimetype ?? '').toLowerCase())) {
    throw new BadRequestException(`Unsupported file type "${file.mimetype}" - upload a CSV file`);
  }
  if (file.size > CSV_IMPORT_MAX_BYTES) {
    throw new BadRequestException(`File is too large (max ${CSV_IMPORT_MAX_BYTES / 1024 / 1024} MB)`);
  }
  const bytes = file.buffer;
  // ZIP (xlsx/docx) and PDF signatures: reject binaries disguised as .csv.
  if (bytes.length >= 4 && ((bytes[0] === 0x50 && bytes[1] === 0x4b) || bytes.subarray(0, 4).toString() === '%PDF')) {
    throw new BadRequestException('This file is not a CSV (it looks like an Excel or PDF file)');
  }
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

  const headers = parsed.headers;
  const lower = headers.map((h) => h.toLowerCase());
  const missing = requiredHeaders.filter((h) => !lower.includes(h.toLowerCase()));
  if (missing.length > 0) {
    throw new BadRequestException(`Missing required column(s): ${missing.join(', ')}. Expected: ${expectedHeaders.join(', ')}`);
  }
  const unknown = headers.filter((h) => !expectedHeaders.some((e) => e.toLowerCase() === h.toLowerCase()));
  if (unknown.length > 0) {
    throw new BadRequestException(`Unknown column(s): ${unknown.join(', ')}. Expected: ${expectedHeaders.join(', ')}`);
  }
  const dupes = lower.filter((h, i) => lower.indexOf(h) !== i);
  if (dupes.length > 0) throw new BadRequestException(`Duplicate column(s): ${[...new Set(dupes)].join(', ')}`);

  if (parsed.rows.length === 0) throw new BadRequestException('The CSV has a header row but no data rows');
  if (parsed.rows.length > CSV_IMPORT_MAX_ROWS) {
    throw new BadRequestException(`Too many rows (${parsed.rows.length}); the maximum per import is ${CSV_IMPORT_MAX_ROWS}`);
  }

  // Normalise to canonical header names/order.
  const index = expectedHeaders.map((e) => lower.indexOf(e.toLowerCase()));
  const rows = parsed.rows.map((r) => index.map((i) => (i >= 0 ? (r[i] ?? '').trim() : '')));
  return { fileName, headers: [...expectedHeaders], rows };
}

/** Row objects keyed by canonical header. */
export function toRecords(headers: readonly string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}
