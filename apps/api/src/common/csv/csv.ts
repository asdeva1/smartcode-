/**
 * Minimal RFC 4180 CSV reader/writer - no dependency needed for the
 * import/export shapes this app uses. Handles quoted fields, escaped
 * quotes (""), commas/newlines inside quotes, CRLF/LF, and a leading
 * UTF-8 BOM (Excel on Windows adds one when saving as CSV).
 */
export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export class CsvParseError extends Error {}

export function parseCsv(input: string): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      if (field.length > 0) throw new CsvParseError(`Unexpected quote in unquoted field on line ${records.length + 1}`);
      inQuotes = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRecord();
    } else if (ch === '\n') {
      endRecord();
    } else {
      field += ch;
    }
    i += 1;
  }
  if (inQuotes) throw new CsvParseError('Unterminated quoted field');
  if (field.length > 0 || record.length > 0) endRecord();

  // Drop fully blank lines (common trailing newline / spacer rows).
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) throw new CsvParseError('The file is empty');

  const [headerRow, ...rows] = nonEmpty;
  return { headers: headerRow.map((h) => h.trim()), rows };
}

/**
 * Neutralises spreadsheet formula injection: a cell beginning with
 * = + - @ (or tab/CR) is executed as a formula by Excel/Sheets when the
 * export is opened, so it is prefixed with an apostrophe.
 */
export function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map((h) => quote(sanitizeCell(h))).join(',')];
  for (const row of rows) {
    lines.push(
      row.map((cell) => (typeof cell === 'number' ? String(cell) : quote(sanitizeCell(cell)))).join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
