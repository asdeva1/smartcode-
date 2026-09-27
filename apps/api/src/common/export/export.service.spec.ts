import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { ExportService, exportFileName, parseExportFormat } from './export.service';

const now = new Date('2026-03-04T05:06:07Z');
const req = {
  title: 'Team Coders',
  columns: [
    { key: 'name', label: 'Name' },
    { key: 'charts', label: 'Charts', numeric: true },
  ],
  rows: [{ name: '=cmd()', charts: 3 }, { name: 'Jane, Doe', charts: 5 }],
  filters: { status: 'active', search: undefined },
  generatedBy: 'tl.one',
  now,
};

describe('ExportService', () => {
  const svc = new ExportService();

  it('names files by title and generation time', () => {
    expect(exportFileName('Team Coders', 'xlsx', now)).toBe('smartcode-team-coders-20260304-0506.xlsx');
  });

  it('only accepts csv, xlsx and pdf', () => {
    expect(parseExportFormat('PDF')).toBe('pdf');
    expect(() => parseExportFormat('docx')).toThrow(BadRequestException);
  });

  it('CSV: BOM, title, generation time, applied filters, header row, data, formula injection neutralised', async () => {
    const { buffer, contentType, fileName } = await svc.build('csv', req);
    const text = buffer.toString('utf8');
    expect(contentType).toBe('text/csv; charset=utf-8');
    expect(fileName.endsWith('.csv')).toBe(true);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('"# Team Coders"');
    expect(text).toContain('Generated: 2026-03-04 05:06:07 UTC by tl.one');
    expect(text).toContain('Filters: status: active"');
    expect(text).toContain('Name,Charts\r\n');
    expect(text).toContain("'=cmd(),3");
    expect(text).toContain('"Jane, Doe",5');
  });

  it('XLSX: a real workbook with metadata, header and typed numeric cells', async () => {
    const { buffer } = await svc.build('xlsx', req);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A1').value).toBe('Team Coders');
    expect(String(ws.getCell('A2').value)).toContain('Generated: 2026-03-04');
    expect(ws.getRow(5).values).toEqual([undefined, 'Name', 'Charts']);
    expect(ws.getCell('A6').value).toBe("'=cmd()");
    expect(ws.getCell('B7').value).toBe(5);
  });

  it('PDF: a valid PDF document', async () => {
    const { buffer, contentType } = await svc.build('pdf', { ...req, rows: [] });
    expect(contentType).toBe('application/pdf');
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.subarray(-6).toString()).toContain('%%EOF');
  });

  it('streams as an attachment', async () => {
    const file = await svc.stream('csv', req);
    expect(file.getHeaders()).toMatchObject({ type: 'text/csv; charset=utf-8', disposition: expect.stringMatching(/^attachment; filename="smartcode-team-coders-/) });
  });
});
