import { BadRequestException } from '@nestjs/common';
import { CsvParseError, parseCsv, sanitizeCell, toCsv } from './csv';
import { readCsvUpload, toRecords } from './csv-upload';

describe('parseCsv', () => {
  it('parses quoted fields, escaped quotes, embedded commas and newlines, CRLF and a UTF-8 BOM', () => {
    const text = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"multi\nline",z\r\n';
    expect(parseCsv(text)).toEqual({ headers: ['a', 'b', 'c'], rows: [['1', 'x, y', 'say "hi"'], ['2', 'multi\nline', 'z']] });
  });

  it('ignores blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n,\n').rows).toEqual([['1', '2']]);
  });

  it('rejects an unterminated quote and an empty file', () => {
    expect(() => parseCsv('a\n"oops')).toThrow(CsvParseError);
    expect(() => parseCsv('\n\n')).toThrow('The file is empty');
  });
});

describe('toCsv / sanitizeCell', () => {
  it('quotes where needed and neutralises spreadsheet formula injection', () => {
    expect(toCsv(['A', 'B'], [['=SUM(1)', 'plain'], ['a,b', 3]])).toBe('A,B\r\n\'=SUM(1),plain\r\n"a,b",3\r\n');
    for (const bad of ['=1', '+1', '-1', '@x']) expect(sanitizeCell(bad).startsWith("'")).toBe(true);
    expect(sanitizeCell(null)).toBe('');
  });
});

describe('readCsvUpload', () => {
  const file = (content: string | Buffer, originalname = 'data.csv', mimetype = 'text/csv') => {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    return { originalname, mimetype, size: buffer.length, buffer };
  };
  const headers = ['chartId', 'count', 'remarks'] as const;

  it('accepts a valid CSV, case-insensitive headers in any order, and normalises to canonical order', () => {
    const r = readCsvUpload(file('COUNT,chartid\n3,CH-1\n'), headers, ['chartId', 'count']);
    expect(r.headers).toEqual(['chartId', 'count', 'remarks']);
    expect(toRecords(r.headers, r.rows)).toEqual([{ chartId: 'CH-1', count: '3', remarks: '' }]);
  });

  it('accepts the MIME type Windows/Excel reports for .csv', () => {
    expect(() => readCsvUpload(file('chartId,count,remarks\nA,1,\n', 'x.csv', 'application/vnd.ms-excel'), headers)).not.toThrow();
  });

  it.each([
    ['no file', undefined, 'Attach a CSV file'],
    ['wrong extension', file('a', 'data.xlsx'), 'Only .csv files'],
    ['wrong MIME', file('a', 'data.csv', 'application/pdf'), 'Unsupported file type'],
    ['xlsx disguised as .csv', file(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])), 'looks like an Excel or PDF'],
    ['pdf disguised as .csv', file('%PDF-1.7 xxx'), 'looks like an Excel or PDF'],
    ['non UTF-8', file(Buffer.from([0x63, 0x68, 0xff, 0xfe, 0x0a])), 'UTF-8'],
    ['missing column', file('chartId\nA\n'), 'Missing required column(s): count'],
    ['unknown column', file('chartId,count,remarks,extra\nA,1,,2\n'), 'Unknown column(s): extra'],
    ['duplicate column', file('chartId,count,count,remarks\nA,1,1,\n'), 'Duplicate column(s)'],
    ['header only', file('chartId,count,remarks\n'), 'no data rows'],
  ])('rejects %s', (_label, f, message) => {
    expect(() => readCsvUpload(f as any, headers)).toThrow(BadRequestException);
    expect(() => readCsvUpload(f as any, headers)).toThrow(message);
  });

  it('enforces the per-import row limit', () => {
    const body = 'chartId,count,remarks\n' + Array.from({ length: 1001 }, (_, i) => `C${i},1,`).join('\n');
    expect(() => readCsvUpload(file(body), headers)).toThrow('maximum per import is 1000');
  });
});
