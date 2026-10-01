import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AuthUser } from '@smartcode/types';
import { ChartImportsService } from './chart-imports.service';
import { PrismaService } from '../../prisma/prisma.service';

const manager: AuthUser = { id: 'm-1', employeeId: 'E1', loginName: 'mgr', email: 'mgr@x.local', role: 'MANAGER', teamId: null, isActive: true };
const teamLead: AuthUser = { ...manager, id: 'tl-1', role: 'TEAM_LEAD' };
const vendor: AuthUser = { ...manager, id: 'v-1', role: 'VENDOR' };
const coder: AuthUser = { ...manager, id: 'c-1', role: 'CODER' };

const HEADER = 'ChartID,PageCount,PageBucket,textbox9,EventTypeName2,High_Level_Status';

function csvFile(text: string, originalname = 'allocation.csv') {
  const buffer = Buffer.from(text, 'utf-8');
  return { originalname, mimetype: 'text/csv', size: buffer.length, buffer };
}

function row(chartId: string, pageCount: string | number = 63, bucket = '50-74 Pages', tb9 = '6169', eventType = 'Unassigned Charts', status = 'Coding Inventory') {
  return `${chartId},${pageCount},${bucket},${tb9},${eventType},${status}`;
}

async function xlsxFile(
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
  originalname = 'Allocation.xlsx',
): Promise<{ originalname: string; mimetype: string; size: number; buffer: Buffer }> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer);
  return { originalname, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: buffer.length, buffer };
}

describe('ChartImportsService (Phase 10B: client file driven chart import)', () => {
  let service: ChartImportsService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      chartImportTemplate: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'tmpl-1', projectId: 'p-1' }),
      },
      chartImportTemplateVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _max: { version: null } }),
        create: jest.fn().mockResolvedValue({ id: 'tv-1', templateId: 'tmpl-1', version: 1, headers: HEADER.split(','), isActive: true }),
      },
      // Default resolved value mirrors the pattern already used above for
      // chartImportTemplate/chartImportTemplateVersion: any test that
      // reaches the write transaction without its own mockResolvedValueOnce
      // override still gets a realistic importRow with an id (production
      // code legitimately reads importRow.id to stamp Chart.sourceImportId
      // before the test's own scenario - e.g. a later chart.createMany
      // rejection - gets a chance to fire). Tests that need a specific id
      // (e.g. 'ci-1', 'ci-2') still override this via mockResolvedValueOnce.
      chartImport: { create: jest.fn().mockResolvedValue({ id: 'ci-default' }), update: jest.fn() },
      chart: { createMany: jest.fn().mockResolvedValue({ count: 0 }), update: jest.fn() },
      chartImportRow: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1', name: 'Project Centauri', allocationType: 'MANUAL' }) },
      chart: { findMany: jest.fn().mockResolvedValue([]) },
      chartImport: {
        create: jest.fn().mockResolvedValue({ id: 'ci-rejected' }),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const moduleRef = await Test.createTestingModule({ providers: [ChartImportsService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = moduleRef.get(ChartImportsService);
  });

  describe('RBAC', () => {
    it('is Manager-only', async () => {
      await expect(service.preview(teamLead, 'p-1', csvFile([HEADER, row('609363220')].join('\n')))).rejects.toThrow(ForbiddenException);
      await expect(service.preview(vendor, 'p-1', csvFile([HEADER, row('609363220')].join('\n')))).rejects.toThrow(ForbiddenException);
      await expect(service.preview(coder, 'p-1', csvFile([HEADER, row('609363220')].join('\n')))).rejects.toThrow(ForbiddenException);
      await expect(service.commit(teamLead, 'p-1', csvFile([HEADER, row('609363220')].join('\n')))).rejects.toThrow(ForbiddenException);
    });

    it('404s for an unknown project', async () => {
      prisma.project.findUnique.mockResolvedValueOnce(null);
      await expect(service.preview(manager, 'missing', csvFile([HEADER, row('609363220')].join('\n')))).rejects.toThrow(NotFoundException);
    });
  });

  describe('CSV import - preview', () => {
    it('accepts a valid file with the two documented example rows', async () => {
      const file = csvFile([HEADER, row('609363220', 63), row('609450011', 64)].join('\n'));
      const preview = await service.preview(manager, 'p-1', file);
      expect(preview.totalRows).toBe(2);
      expect(preview.validRows).toBe(2);
      expect(preview.invalidRows).toBe(0);
      expect(preview.rows[0].data).toMatchObject({ ChartID: '609363220', PageCount: '63', EventTypeName2: 'Unassigned Charts', High_Level_Status: 'Coding Inventory' });
    });

    it('rejects a file missing a required header', async () => {
      const file = csvFile('ChartID,PageCount\n609363220,63');
      await expect(service.preview(manager, 'p-1', file)).rejects.toThrow(BadRequestException);
    });

    it('rejects a file with an unexpected/renamed header (client column names are never renamed)', async () => {
      const file = csvFile('ChartId,PageCount,PageBucket,textbox9,EventTypeName2,High_Level_Status\n609363220,63,50-74 Pages,6169,Unassigned Charts,Coding Inventory');
      await expect(service.preview(manager, 'p-1', file)).rejects.toThrow(BadRequestException);
    });

    it('flags a missing ChartID with a specific, useful message', async () => {
      const file = csvFile([HEADER, ',63,50-74 Pages,6169,Unassigned Charts,Coding Inventory'].join('\n'));
      const preview = await service.preview(manager, 'p-1', file);
      expect(preview.rows[0].status).toBe('invalid');
      expect(preview.rows[0].errors).toContain('ChartID is required');
    });

    it('flags an invalid (non-numeric) PageCount with a specific message', async () => {
      const file = csvFile([HEADER, row('609363220', 'not-a-number')].join('\n'));
      const preview = await service.preview(manager, 'p-1', file);
      expect(preview.rows[0].status).toBe('invalid');
      expect(preview.rows[0].errors).toContain('PageCount must be a valid whole number');
    });

    it('CORRECTED (architecture review): flags EVERY occurrence of a duplicate ChartID within the uploaded file - not just the later one - and imports none of them', async () => {
      const file = csvFile([HEADER, row('609363220', 63), row('609363220', 64)].join('\n'));
      const preview = await service.preview(manager, 'p-1', file);
      expect(preview.rows[0].status).toBe('duplicate');
      expect(preview.rows[1].status).toBe('duplicate');
      expect(preview.rows[0].errors[0]).toMatch(/Duplicate ChartID 609363220 found in row 3/);
      expect(preview.rows[1].errors[0]).toMatch(/Duplicate ChartID 609363220 found in row 2/);
      expect(preview.duplicateRows).toBe(2);
      expect(preview.validRows).toBe(0);
    });

    it('does not silently choose between duplicate rows with conflicting PageCount values - both are rejected', async () => {
      const file = csvFile([HEADER, row('609363220', 63), row('609363220', 999)].join('\n'));
      const preview = await service.preview(manager, 'p-1', file);
      expect(preview.rows.every((r) => r.status === 'duplicate')).toBe(true);
    });

    it('names every conflicting row when a ChartID appears more than twice', async () => {
      const file = csvFile([HEADER, row('609363220', 63), row('609999999', 10), row('609363220', 64), row('609363220', 65)].join('\n'));
      const preview = await service.preview(manager, 'p-1', file);
      expect(preview.rows[0].status).toBe('duplicate');
      expect(preview.rows[0].errors[0]).toMatch(/Duplicate ChartID 609363220 also appears in rows 4, 5/);
      expect(preview.rows[1].status).toBe('valid');
      expect(preview.duplicateRows).toBe(3);
    });

    it('flags a ChartID that already exists under a different project as invalid, but not one that exists in this same project', async () => {
      prisma.chart.findMany.mockResolvedValueOnce([
        { chartId: '609363220', projectId: 'OTHER-PROJECT' },
        { chartId: '609450011', projectId: 'p-1' },
      ]);
      const file = csvFile([HEADER, row('609363220'), row('609450011')].join('\n'));
      const preview = await service.preview(manager, 'p-1', file);
      expect(preview.rows[0].status).toBe('invalid');
      expect(preview.rows[0].errors[0]).toMatch(/already exists under a different project/);
      expect(preview.rows[1].status).toBe('valid');
      expect(preview.existingInProjectRows).toBe(1);
    });

    it('does not silently discard invalid rows - they are reported, not dropped, from the total', async () => {
      const file = csvFile([HEADER, row('609363220'), ',63,,,,'].join('\n'));
      const preview = await service.preview(manager, 'p-1', file);
      expect(preview.totalRows).toBe(2);
      expect(preview.invalidRows).toBe(1);
    });
  });

  describe('Excel import', () => {
    it('imports from the "Raw" sheet of an .xlsx workbook', async () => {
      const file = await xlsxFile('Raw', HEADER.split(','), [
        ['609363220', 63, '50-74 Pages', '6169', 'Unassigned Charts', 'Coding Inventory'],
        ['609450011', 64, '50-74 Pages', '6169', 'Unassigned Charts', 'Coding Inventory'],
      ]);
      const preview = await service.preview(manager, 'p-1', file);
      expect(preview.fileType).toBe('XLSX');
      expect(preview.totalRows).toBe(2);
      expect(preview.validRows).toBe(2);
    });

    it('rejects a workbook with no "Raw" sheet, and does NOT silently fall back to "Summary"', async () => {
      const file = await xlsxFile('Summary', [...HEADER.split(','), 'Assigned to', 'Shift'], [['609363220', 63, '', '', '', '', '', '']]);
      await expect(service.preview(manager, 'p-1', file)).rejects.toThrow(/no "Raw" sheet/);
    });

    it('validates headers on the Excel Raw sheet the same as CSV', async () => {
      const file = await xlsxFile('Raw', ['ChartID', 'PageCount'], [['609363220', 63]]);
      await expect(service.preview(manager, 'p-1', file)).rejects.toThrow(BadRequestException);
    });

    it('detects a duplicate ChartID in an Excel import (both occurrences flagged, per the corrected all-occurrences rule)', async () => {
      const file = await xlsxFile('Raw', HEADER.split(','), [
        ['609363220', 63, '', '', '', ''],
        ['609363220', 64, '', '', '', ''],
      ]);
      const preview = await service.preview(manager, 'p-1', file);
      expect(preview.duplicateRows).toBe(2);
    });
  });

  describe('commit - transaction safety and duplicate rules', () => {
    it('rejects legacy .xls files with a clear message', async () => {
      const buffer = Buffer.from('not really xls');
      await expect(
        service.preview(manager, 'p-1', { originalname: 'old.xls', mimetype: 'application/vnd.ms-excel', size: buffer.length, buffer }),
      ).rejects.toThrow(/Legacy .xls files are not supported/);
    });

    it('commits valid rows in one transaction, creates the ChartImport history row inside it, and writes a ChartImportRow per valid row rather than storing values on Chart', async () => {
      const file = csvFile([HEADER, row('609363220', 63), row('609450011', 64)].join('\n'));
      tx.chartImport.create.mockResolvedValueOnce({ id: 'ci-1' });
      tx.chartImport.update.mockResolvedValueOnce({ id: 'ci-1', status: 'COMPLETED', successRows: 2, failedRows: 0 });
      prisma.chartImport.findUniqueOrThrow.mockResolvedValueOnce({ id: 'ci-1', status: 'COMPLETED', successRows: 2, failedRows: 0 });

      const result = await service.commit(manager, 'p-1', file);

      expect(tx.chart.createMany).toHaveBeenCalledTimes(1);
      expect(tx.chart.createMany.mock.calls[0][0].data).toHaveLength(2);
      // Chart itself gets ONLY identity + provenance-pointer fields - never
      // the client attribute values (those go to ChartImportRow below).
      expect(tx.chart.createMany.mock.calls[0][0].data[0]).toEqual({ chartId: '609363220', projectId: 'p-1', sourceImportId: 'ci-1' });
      expect(tx.chart.createMany.mock.calls[0][0].data[0]).not.toHaveProperty('pageCount');
      expect(tx.chartImportRow.createMany).toHaveBeenCalledTimes(1);
      expect(tx.chartImportRow.createMany.mock.calls[0][0].data).toHaveLength(2);
      expect(tx.chartImportRow.createMany.mock.calls[0][0].data[0]).toMatchObject({
        chartImportId: 'ci-1', templateVersionId: 'tv-1', chartId: '609363220', rowNumber: 2, pageCount: 63,
      });
      expect(tx.chartImport.update.mock.calls[0][0].data.status).toBe('COMPLETED');
      const txActions = tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
      expect(txActions).toContain('CLIENT_CHART_IMPORT_COMPLETED');
      expect(result.status).toBe('COMPLETED');
      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
    });

    it('CORRECTED (architecture review): re-importing an already-existing Chart in the SAME project never overwrites Chart - it only refreshes the provenance pointer and appends a fresh ChartImportRow, preserving every prior import as its own row', async () => {
      prisma.chart.findMany.mockResolvedValueOnce([{ chartId: '609363220', projectId: 'p-1' }]); // validateRows existing-check
      prisma.chart.findMany.mockResolvedValueOnce([{ chartId: '609363220' }]); // commit's own existingInProject check
      tx.chartImport.create.mockResolvedValueOnce({ id: 'ci-2' });
      tx.chartImport.update.mockResolvedValueOnce({ id: 'ci-2', status: 'COMPLETED', successRows: 1, failedRows: 0 });
      prisma.chartImport.findUniqueOrThrow.mockResolvedValueOnce({ id: 'ci-2', status: 'COMPLETED', successRows: 1, failedRows: 0 });

      const file = csvFile([HEADER, row('609363220', 70)].join('\n'));
      const result = await service.commit(manager, 'p-1', file);

      expect(tx.chart.createMany).not.toHaveBeenCalled();
      // Chart.update touches ONLY the provenance pointer - never pageCount
      // or any other client attribute value, and never any production/
      // audit/rework-related field.
      expect(tx.chart.update).toHaveBeenCalledTimes(1);
      expect(tx.chart.update.mock.calls[0][0]).toEqual({ where: { chartId: '609363220' }, data: { sourceImportId: 'ci-2' } });
      // The new import's values (PageCount 70) are recorded as a brand-new
      // ChartImportRow, never as an overwrite of anything.
      expect(tx.chartImportRow.createMany.mock.calls[0][0].data[0]).toMatchObject({ chartId: '609363220', pageCount: 70 });
      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
    });

    it('rejects outright (status REJECTED) when there are no valid rows, and writes no Chart', async () => {
      // A row that IS present after parsing but fails row-level validation
      // (missing ChartID, same fixture as the "flags a missing ChartID"
      // preview test above) - not a fully blank row. A fully blank data row
      // is dropped entirely by the CSV parser's own blank-line filter
      // before it ever reaches per-row validation, so it trips the upload
      // layer's separate "header row but no data rows at all" guard
      // (chart-import-upload.ts) instead - which correctly throws before
      // any ChartImport history row is warranted, since there is no row to
      // have rejected. This fixture instead reaches commit()'s own
      // "zero valid rows among the rows that were actually parsed" business
      // rule, which is what this test is meant to exercise.
      const file = csvFile([HEADER, ',63,50-74 Pages,6169,Unassigned Charts,Coding Inventory'].join('\n'));
      await expect(service.commit(manager, 'p-1', file)).rejects.toThrow(BadRequestException);
      expect(prisma.chartImport.create.mock.calls[0][0].data.status).toBe('REJECTED');
      expect(tx.chart.createMany).not.toHaveBeenCalled();
      const rejectedLog = prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
      expect(rejectedLog).toContain('CLIENT_CHART_IMPORT_REJECTED');
    });

    it('CORRECTED (final round): rejects the ENTIRE file when even one row is invalid, even though 998/1000-style "mostly valid" rows exist - nothing is partially imported', async () => {
      const file = csvFile([HEADER, row('609363220', 63), row('609450011', 'not-a-number')].join('\n'));
      await expect(service.commit(manager, 'p-1', file)).rejects.toThrow(BadRequestException);
      const rejected = prisma.chartImport.create.mock.calls[0][0].data;
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.validRows).toBe(1);
      expect(rejected.invalidRows).toBe(1);
      // No Chart, no ChartImportRow, and no sourceImportId update happen for
      // the one row that WOULD have been valid on its own - the whole file
      // is one authoritative unit.
      expect(tx.chart.createMany).not.toHaveBeenCalled();
      expect(tx.chart.update).not.toHaveBeenCalled();
      expect(tx.chartImportRow.createMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      const rejectedLog = prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
      expect(rejectedLog).toContain('CLIENT_CHART_IMPORT_REJECTED');
    });

    it('CORRECTED (final round): rejects the ENTIRE file when a duplicate ChartID coexists with otherwise-valid rows', async () => {
      const file = csvFile([HEADER, row('609363220', 63), row('609363220', 64), row('609999999', 10)].join('\n'));
      await expect(service.commit(manager, 'p-1', file)).rejects.toThrow(BadRequestException);
      const rejected = prisma.chartImport.create.mock.calls[0][0].data;
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.duplicateRows).toBe(2);
      expect(rejected.validRows).toBe(1);
      expect(tx.chart.createMany).not.toHaveBeenCalled();
      expect(tx.chartImportRow.createMany).not.toHaveBeenCalled();
    });

    it('valid file (every row valid) still imports successfully in one transaction', async () => {
      const file = csvFile([HEADER, row('609363220', 63), row('609450011', 64)].join('\n'));
      tx.chartImport.create.mockResolvedValueOnce({ id: 'ci-9' });
      tx.chartImport.update.mockResolvedValueOnce({ id: 'ci-9', status: 'COMPLETED', successRows: 2, failedRows: 0 });
      prisma.chartImport.findUniqueOrThrow.mockResolvedValueOnce({ id: 'ci-9', status: 'COMPLETED', successRows: 2, failedRows: 0 });
      const result = await service.commit(manager, 'p-1', file);
      expect(result.status).toBe('COMPLETED');
      expect(tx.chart.createMany).toHaveBeenCalledTimes(1);
    });

    it('never reports COMPLETED if the transaction fails - records FAILED and rolls back, nothing is imported', async () => {
      tx.chart.createMany.mockRejectedValueOnce(new Error('boom'));
      const file = csvFile([HEADER, row('609363220')].join('\n'));
      await expect(service.commit(manager, 'p-1', file)).rejects.toThrow('boom');
      expect(prisma.chartImport.create.mock.calls[0][0].data.status).toBe('FAILED');
      expect(prisma.chartImport.create.mock.calls[0][0].data.successRows).toBe(0);
      const actions = prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
      expect(actions).toContain('CLIENT_CHART_IMPORT_FAILED');
    });

    it('reports a clear conflict (409) rather than a false success on a concurrent duplicate ChartID race', async () => {
      tx.chart.createMany.mockRejectedValueOnce(Object.assign(new Error(), { code: 'P2002' }));
      const file = csvFile([HEADER, row('609363220')].join('\n'));
      await expect(service.commit(manager, 'p-1', file)).rejects.toThrow(ConflictException);
    });

    it('CORRECTED (architecture review): creates the project-level ChartImportTemplate lazily on first import, then reuses it for later imports', async () => {
      const file = csvFile([HEADER, row('609363220', 63)].join('\n'));
      tx.chartImport.create.mockResolvedValueOnce({ id: 'ci-1' });
      tx.chartImport.update.mockResolvedValueOnce({ id: 'ci-1', status: 'COMPLETED', successRows: 1, failedRows: 0 });
      prisma.chartImport.findUniqueOrThrow.mockResolvedValueOnce({ id: 'ci-1', status: 'COMPLETED', successRows: 1, failedRows: 0 });

      await service.commit(manager, 'p-1', file);

      expect(tx.chartImportTemplate.findUnique.mock.calls[0][0]).toEqual({ where: { projectId: 'p-1' } });
      expect(tx.chartImportTemplate.create.mock.calls[0][0]).toEqual({ data: { projectId: 'p-1' } });
      expect(tx.chartImportTemplateVersion.create.mock.calls[0][0].data).toMatchObject({ templateId: 'tmpl-1', version: 1 });

      // A second import for the same project with a pre-existing Template
      // reuses it rather than creating a duplicate.
      tx.chartImportTemplate.findUnique.mockResolvedValueOnce({ id: 'tmpl-1', projectId: 'p-1' });
      tx.chartImportTemplateVersion.findFirst.mockResolvedValueOnce({ id: 'tv-1', templateId: 'tmpl-1', version: 1, headers: HEADER.split(','), isActive: true });
      tx.chartImport.create.mockResolvedValueOnce({ id: 'ci-2' });
      tx.chartImport.update.mockResolvedValueOnce({ id: 'ci-2', status: 'COMPLETED', successRows: 1, failedRows: 0 });
      prisma.chartImport.findUniqueOrThrow.mockResolvedValueOnce({ id: 'ci-2', status: 'COMPLETED', successRows: 1, failedRows: 0 });
      prisma.chart.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.commit(manager, 'p-1', csvFile([HEADER, row('609450011', 64)].join('\n')));

      expect(tx.chartImportTemplate.create).toHaveBeenCalledTimes(1); // still only once - reused, not duplicated
    });

    it('unauthorized (non-Manager) commit is rejected before any file parsing/DB write', async () => {
      await expect(service.commit(teamLead, 'p-1', csvFile([HEADER, row('609363220')].join('\n')))).rejects.toThrow(ForbiddenException);
      expect(tx.chart.createMany).not.toHaveBeenCalled();
    });
  });

  describe('MANUAL vs AUTOMATIC allocation-type enforcement (final round)', () => {
    it('allows preview for a MANUAL project (the default fixture)', async () => {
      const file = csvFile([HEADER, row('609363220')].join('\n'));
      await expect(service.preview(manager, 'p-1', file)).resolves.toBeDefined();
    });

    it('allows commit for a MANUAL project (the default fixture)', async () => {
      const file = csvFile([HEADER, row('609363220')].join('\n'));
      tx.chartImport.create.mockResolvedValueOnce({ id: 'ci-manual' });
      tx.chartImport.update.mockResolvedValueOnce({ id: 'ci-manual', status: 'COMPLETED', successRows: 1, failedRows: 0 });
      prisma.chartImport.findUniqueOrThrow.mockResolvedValueOnce({ id: 'ci-manual', status: 'COMPLETED', successRows: 1, failedRows: 0 });
      await expect(service.commit(manager, 'p-1', file)).resolves.toBeDefined();
    });

    it('rejects preview for an AUTOMATIC project - client chart import is a MANUAL-only workflow', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p-auto', name: 'Automatic Project', allocationType: 'AUTOMATIC' });
      const file = csvFile([HEADER, row('609363220')].join('\n'));
      await expect(service.preview(manager, 'p-auto', file)).rejects.toThrow(/available only for MANUAL allocation projects/);
    });

    it('rejects commit for an AUTOMATIC project, before any file parsing/DB write', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p-auto', name: 'Automatic Project', allocationType: 'AUTOMATIC' });
      const file = csvFile([HEADER, row('609363220')].join('\n'));
      await expect(service.commit(manager, 'p-auto', file)).rejects.toThrow(BadRequestException);
      expect(tx.chart.createMany).not.toHaveBeenCalled();
    });
  });

  describe('import history', () => {
    it('lists import history for a project, most recent first', async () => {
      prisma.chartImport.findMany.mockResolvedValueOnce([
        { id: 'ci-2', fileName: 'b.csv', fileType: 'CSV', status: 'COMPLETED', totalRows: 2, validRows: 2, invalidRows: 0, duplicateRows: 0, successRows: 2, failedRows: 0, importedAt: new Date(), importedBy: null, templateVersion: null },
      ]);
      prisma.chartImport.count.mockResolvedValueOnce(1);
      const result = await service.listHistory(manager, 'p-1', { page: 1, pageSize: 25 } as any);
      expect(result.total).toBe(1);
      expect(prisma.chartImport.findMany.mock.calls[0][0]).toMatchObject({ where: { projectId: 'p-1' }, orderBy: { importedAt: 'desc' } });
    });

    it('404s for an import belonging to a different project', async () => {
      prisma.chartImport.findFirst = jest.fn().mockResolvedValueOnce(null);
      await expect(service.getHistoryDetail(manager, 'p-1', 'ci-other-project')).rejects.toThrow(NotFoundException);
    });
  });

  // Summary export (GET /chart-imports/summary-export) was REMOVED from this
  // phase per architecture review - it is Phase 10C's Manager Allocation
  // Workspace scope, not this phase's backend-foundation scope. See
  // docs/09-BUSINESS-RULES.md "No Manager Allocation Summary export in this
  // phase".
});
