import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AuthUser } from '@smartcode/types';
import { CHART_ALLOCATION_SUMMARY_HEADERS } from '@smartcode/types';
import { ChartAllocationsService } from './chart-allocations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { parseCsv } from '../../common/csv/csv';

/**
 * Phase 10D — Chart Allocation. Covers the 22-item test list from
 * docs/09-BUSINESS-RULES.md section 12 / the Phase 10D instruction:
 *   1  Manager Summary export
 *   2  exact required columns
 *   3  blank "Assigned to" is skipped, not rejected (documented interpretation)
 *   4  "Shift 1" is always fixed in the export
 *   5  Team Lead upload (preview + commit happy path)
 *   6  invalid Login Name
 *   7  inactive coder
 *   8  non-Coder Login Name
 *   9  wrong Team
 *   10 wrong Vendor (same check as Team - see note below)
 *   11 wrong Project
 *   12 duplicate ChartID inside upload
 *   13 already actively allocated Chart (different coder -> reject; same coder -> no-op)
 *   14 entire-file rejection (all-or-nothing)
 *   15 successful multi-row allocation
 *   16 duplicate/concurrent allocation protection (P2002 -> 409)
 *   17 pullback (success + blocked cases)
 *   18 reassignment (success + validate-before-write + reject same coder)
 *   19 allocation history
 *   20 MANUAL vs AUTOMATIC project behavior
 * Items 21 (existing chart-import regression) and 22 (existing production/
 * audit/rework regression) are covered by chart-imports.service.spec.ts and
 * production.service.spec.ts (this phase's additions there are purely
 * additive - see the "Phase 10D" describe block added to
 * production.service.spec.ts), both left otherwise untouched by this phase.
 *
 * NOTE on item 10 ("wrong Vendor"): the given business rules do not define
 * a Vendor identity independent of Team membership for a Coder - a Coder's
 * team membership already encodes which Vendor->Team cascade placed them
 * there (vendor-scope.ts). validateAllocationRows therefore checks "is this
 * Login Name on this Project's Team", which is also the only place a
 * cross-Vendor Coder could slip in. The "wrong Team" test below doubles as
 * the "wrong Vendor" case; this is documented here and in the final report
 * rather than inventing a second, separate Vendor-only column/check that
 * the given business rules and current schema do not otherwise call for.
 */

const TEAM = 'team-1';
const OTHER_TEAM = 'team-2';
const PROJECT = 'p-1';

const manager: AuthUser = { id: 'm-1', employeeId: 'E1', loginName: 'mgr', email: 'mgr@x.local', role: 'MANAGER', teamId: null, isActive: true };
const teamLead: AuthUser = { ...manager, id: 'tl-1', role: 'TEAM_LEAD', teamId: TEAM };
const otherTeamLead: AuthUser = { ...teamLead, id: 'tl-2', teamId: OTHER_TEAM };
const coder: AuthUser = { ...manager, id: 'c-1', role: 'CODER', teamId: TEAM };
const vendor: AuthUser = { ...manager, id: 'v-1', role: 'VENDOR' };

const MANUAL_PROJECT = { id: PROJECT, name: 'Manual Project', teamId: TEAM, allocationType: 'MANUAL' };
const AUTOMATIC_PROJECT = { id: 'p-auto', name: 'Automatic Project', teamId: TEAM, allocationType: 'AUTOMATIC' };

function csvFile(text: string, originalname = 'summary.csv') {
  const buffer = Buffer.from(text, 'utf-8');
  return { originalname, mimetype: 'text/csv', size: buffer.length, buffer };
}

/** One CSV row in CHART_ALLOCATION_SUMMARY_HEADERS order, "Assigned to"/"Shift 1" last. */
function row(chartId: string, loginName = '', shift = 'Shift 1') {
  return `${chartId},63,50-74 Pages,6169,Unassigned Charts,Coding Inventory,${loginName},${shift}`;
}

const HEADER = CHART_ALLOCATION_SUMMARY_HEADERS.join(',');

async function xlsxFile(sheetName: string, headers: string[], rows: (string | number)[][], originalname = 'Summary.xlsx') {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer);
  return { originalname, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: buffer.length, buffer };
}

const CODER_ROW = { id: coder.id, loginName: 'cody', role: 'CODER', isActive: true, teamId: TEAM };

describe('ChartAllocationsService (Phase 10D: chart allocation)', () => {
  let service: ChartAllocationsService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      chartAllocationImport: { create: jest.fn().mockResolvedValue({ id: 'cai-default' }), update: jest.fn().mockResolvedValue({}) },
      chartAllocation: {
        create: jest.fn(async ({ data }: any) => ({ id: 'ca-new', assignedAt: new Date('2026-09-29T00:00:00.000Z'), ...data })),
        update: jest.fn().mockResolvedValue({}),
      },
      chart: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ ...MANUAL_PROJECT }) },
      team: { findUnique: jest.fn().mockResolvedValue({ id: TEAM, teamLeadId: null }) },
      vendorAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      chart: {
        // Default shape covers both call sites: validateAllocationRows (only
        // reads chartId/projectId) and listAllocatable/exportSummary (also
        // read importRows/assignedCoder/productionEntries via toListRow,
        // whose parameter type is `Prisma.ChartGetPayload<{include:
        // {productionEntries: true}}>` - i.e. FULL ProductionEntry rows,
        // not a projection). One complete row here so this default fixture
        // conforms to the generated type rather than an empty placeholder;
        // individual tests override with mockResolvedValueOnce for their
        // specific fixture shape.
        findMany: jest.fn().mockResolvedValue([{
          chartId: '609363220', projectId: PROJECT, importRows: [], assignedCoder: null, assignedAt: null,
          productionEntries: [{
            id: 'pe-default', chartId: '609363220', coderId: coder.id, version: 1, isCurrent: true,
            pageCount: 10, totalDOS: 1, totalICDs: 1, status: 'PENDING', remarks: null,
            codedDate: new Date('2026-09-29T00:00:00.000Z'), createdAt: new Date('2026-09-29T00:00:00.000Z'), updatedAt: new Date('2026-09-29T00:00:00.000Z'),
          }],
        }]),
        findFirst: jest.fn().mockResolvedValue({ chartId: '609363220', projectId: PROJECT }),
        count: jest.fn().mockResolvedValue(1),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([CODER_ROW]),
        findUnique: jest.fn().mockResolvedValue(CODER_ROW),
      },
      chartAllocation: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      chartAllocationImport: {
        create: jest.fn().mockResolvedValue({ id: 'cai-rejected' }),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      productionEntry: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      rework: { findFirst: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const moduleRef = await Test.createTestingModule({ providers: [ChartAllocationsService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = moduleRef.get(ChartAllocationsService);
  });

  // ─── 20. MANUAL vs AUTOMATIC ─────────────────────────────────────
  describe('MANUAL vs AUTOMATIC project behavior', () => {
    it('allows the Manager to list/export a MANUAL project (default fixture)', async () => {
      await expect(service.listAllocatable(manager, PROJECT, { page: 1, pageSize: 25 } as any)).resolves.toBeDefined();
    });

    it('rejects listing/export for an AUTOMATIC project', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ ...AUTOMATIC_PROJECT });
      await expect(service.listAllocatable(manager, 'p-auto', { page: 1, pageSize: 25 } as any)).rejects.toThrow(/MANUAL allocation projects/);
    });

    it('rejects a Team Lead upload for an AUTOMATIC project - no Team Lead Summary allocation for AUTOMATIC projects', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ ...AUTOMATIC_PROJECT });
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      await expect(service.previewAllocationUpload(teamLead, 'p-auto', file)).rejects.toThrow(/MANUAL allocation projects/);
    });

    it('rejects a non-Manager from listing/exporting', async () => {
      await expect(service.listAllocatable(teamLead, PROJECT, { page: 1, pageSize: 25 } as any)).rejects.toThrow(ForbiddenException);
      await expect(service.listAllocatable(coder, PROJECT, { page: 1, pageSize: 25 } as any)).rejects.toThrow(ForbiddenException);
      await expect(service.listAllocatable(vendor, PROJECT, { page: 1, pageSize: 25 } as any)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a non-Team-Lead from uploading a Summary', async () => {
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      await expect(service.previewAllocationUpload(manager, PROJECT, file)).rejects.toThrow(ForbiddenException);
      await expect(service.previewAllocationUpload(coder, PROJECT, file)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a Team Lead uploading for a Project outside their own Team', async () => {
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      await expect(service.previewAllocationUpload(otherTeamLead, PROJECT, file)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── 1, 4. Manager Summary export ────────────────────────────────
  describe('Manager Summary export', () => {
    it('exports the client Raw columns plus a blank "Assigned to" and a fixed "Shift 1", from the latest ChartImportRow', async () => {
      prisma.chart.findMany.mockResolvedValueOnce([
        { chartId: '609363220', importRows: [{ pageCount: 63, pageBucket: '50-74 Pages', textbox9: '6169', eventTypeName2: 'Unassigned Charts', highLevelStatus: 'Coding Inventory', createdAt: new Date() }] },
      ]);
      const file = await service.exportSummary(manager, PROJECT, { format: 'csv', page: 1, pageSize: 25 } as any);
      const text = file.buffer.toString('utf-8');
      const { headers, rows } = parseCsv(text);
      expect(headers).toEqual([...CHART_ALLOCATION_SUMMARY_HEADERS]);
      const cells = rows[0];
      expect(cells[0]).toBe('609363220'); // ChartID
      expect(cells[6]).toBe(''); // Assigned to - always blank
      expect(cells[7]).toBe('Shift 1'); // Shift 1 - always fixed
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('CHART_ALLOCATION_EXPORTED');
    });

    it('never writes to ChartImportRow (Raw source data) - export is read-only', async () => {
      await service.exportSummary(manager, PROJECT, { format: 'csv', page: 1, pageSize: 25 } as any);
      expect(Object.keys(prisma).includes('chartImportRow')).toBe(false);
    });
  });

  // ─── 2. Exact required columns (upload contract) ─────────────────
  describe('exact required columns', () => {
    it('rejects a Summary upload missing a required column', async () => {
      const file = csvFile('ChartID,PageCount,Assigned to,Shift 1\n609363220,63,cody,Shift 1');
      await expect(service.previewAllocationUpload(teamLead, PROJECT, file)).rejects.toThrow(BadRequestException);
    });

    it('rejects a Summary upload with an unexpected/renamed column', async () => {
      const file = csvFile([...CHART_ALLOCATION_SUMMARY_HEADERS].map((h) => (h === 'Assigned to' ? 'AssignedTo' : h)).join(',') + '\n' + row('609363220', 'cody'));
      await expect(service.previewAllocationUpload(teamLead, PROJECT, file)).rejects.toThrow(BadRequestException);
    });

    it('requires the XLSX re-upload to use a sheet literally named "Summary" - no fallback', async () => {
      const file = await xlsxFile('Raw', [...CHART_ALLOCATION_SUMMARY_HEADERS], [['609363220', 63, '', '', '', '', 'cody', 'Shift 1']]);
      await expect(service.previewAllocationUpload(teamLead, PROJECT, file)).rejects.toThrow(/no "Summary" sheet/);
    });
  });

  // ─── 3. Blank "Assigned to" is skipped, not rejected ─────────────
  describe('blank "Assigned to" handling (documented interpretation)', () => {
    it('does not count a blank "Assigned to" row as part of the allocation instruction at all', async () => {
      const file = csvFile([HEADER, row('609363220', ''), row('609450011', 'cody')].join('\n'));
      const preview = await service.previewAllocationUpload(teamLead, PROJECT, file);
      expect(preview.totalRows).toBe(1);
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0].chartId).toBe('609450011');
    });

    it('rejects a commit where every row is blank - nothing to allocate', async () => {
      const file = csvFile([HEADER, row('609363220', '')].join('\n'));
      await expect(service.commitAllocationUpload(teamLead, PROJECT, file)).rejects.toThrow(/nothing to allocate/);
    });
  });

  // ─── 5, 15. Team Lead upload happy path / successful multi-row allocation ─
  describe('Team Lead upload - preview and successful commit', () => {
    it('preview: a valid Summary with a real ChartID and Coder is reported valid', async () => {
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      const preview = await service.previewAllocationUpload(teamLead, PROJECT, file);
      expect(preview.validRows).toBe(1);
      expect(preview.invalidRows).toBe(0);
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('CHART_ALLOCATION_PREVIEW');
    });

    it('commits a multi-row Summary in one transaction: creates ChartAllocation per row and updates Chart\'s current-assignment pointer', async () => {
      prisma.chart.findMany.mockResolvedValueOnce([
        { chartId: '609363220', projectId: PROJECT },
        { chartId: '609450011', projectId: PROJECT },
      ]);
      prisma.user.findMany.mockResolvedValueOnce([CODER_ROW]).mockResolvedValueOnce([{ id: coder.id, loginName: 'cody' }]);
      tx.chartAllocationImport.create.mockResolvedValueOnce({ id: 'cai-1' });
      prisma.chartAllocationImport.findUniqueOrThrow.mockResolvedValueOnce({ id: 'cai-1', status: 'COMPLETED', successRows: 2, failedRows: 0 });

      const file = csvFile([HEADER, row('609363220', 'cody'), row('609450011', 'cody')].join('\n'));
      const result = await service.commitAllocationUpload(teamLead, PROJECT, file);

      expect(tx.chartAllocation.create).toHaveBeenCalledTimes(2);
      expect(tx.chartAllocation.create.mock.calls[0][0].data).toMatchObject({ chartId: '609363220', projectId: PROJECT, coderId: coder.id, loginNameSnapshot: 'cody', sourceImportId: 'cai-1' });
      expect(tx.chart.update).toHaveBeenCalledTimes(2);
      expect(tx.chart.update.mock.calls[0][0]).toMatchObject({ where: { chartId: '609363220' }, data: { assignedCoderId: coder.id, assignedById: teamLead.id } });
      const actions = tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
      expect(actions).toContain('CHART_ALLOCATION_COMPLETED');
      expect(result.status).toBe('COMPLETED');
      expect(result.successRows).toBe(2);
    });
  });

  // ─── 6. Invalid Login Name ────────────────────────────────────────
  describe('invalid Login Name', () => {
    it('flags a Login Name that does not exist', async () => {
      prisma.user.findMany.mockResolvedValueOnce([]);
      const file = csvFile([HEADER, row('609363220', 'nobody')].join('\n'));
      const preview = await service.previewAllocationUpload(teamLead, PROJECT, file);
      expect(preview.rows[0].status).toBe('invalid');
      expect(preview.rows[0].errors[0]).toMatch(/does not exist/);
    });
  });

  // ─── 7. Inactive coder ────────────────────────────────────────────
  describe('inactive coder', () => {
    it('flags a Login Name belonging to an inactive account', async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ ...CODER_ROW, isActive: false }]);
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      const preview = await service.previewAllocationUpload(teamLead, PROJECT, file);
      expect(preview.rows[0].status).toBe('invalid');
      expect(preview.rows[0].errors[0]).toMatch(/inactive account/);
    });
  });

  // ─── 8. Non-Coder Login Name ──────────────────────────────────────
  describe('non-Coder Login Name', () => {
    it('flags a Login Name that belongs to a non-Coder account (e.g. a Team Lead)', async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ ...CODER_ROW, role: 'TEAM_LEAD' }]);
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      const preview = await service.previewAllocationUpload(teamLead, PROJECT, file);
      expect(preview.rows[0].status).toBe('invalid');
      expect(preview.rows[0].errors[0]).toMatch(/not a Coder account/);
    });
  });

  // ─── 9 & 10. Wrong Team / wrong Vendor (see class-level note) ────
  describe('wrong Team (also stands for "wrong Vendor" - see file header note)', () => {
    it('flags a Login Name whose Coder is not on this Project\'s Team', async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ ...CODER_ROW, teamId: OTHER_TEAM }]);
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      const preview = await service.previewAllocationUpload(teamLead, PROJECT, file);
      expect(preview.rows[0].status).toBe('invalid');
      expect(preview.rows[0].errors[0]).toMatch(/not on this Project's Team/);
    });
  });

  // ─── 11. Wrong Project ────────────────────────────────────────────
  describe('wrong Project', () => {
    it('flags a ChartID that does not belong to this Project', async () => {
      prisma.chart.findMany.mockResolvedValueOnce([{ chartId: '609363220', projectId: 'some-other-project' }]);
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      const preview = await service.previewAllocationUpload(teamLead, PROJECT, file);
      expect(preview.rows[0].status).toBe('invalid');
      expect(preview.rows[0].errors[0]).toMatch(/does not belong to this Project/);
    });

    it('flags a ChartID that does not exist at all', async () => {
      prisma.chart.findMany.mockResolvedValueOnce([]);
      const file = csvFile([HEADER, row('609999999', 'cody')].join('\n'));
      const preview = await service.previewAllocationUpload(teamLead, PROJECT, file);
      expect(preview.rows[0].status).toBe('invalid');
      expect(preview.rows[0].errors[0]).toMatch(/was not found/);
    });
  });

  // ─── 12. Duplicate ChartID inside upload ─────────────────────────
  describe('duplicate ChartID inside upload', () => {
    it('flags EVERY occurrence of a duplicate ChartID and none are imported', async () => {
      const file = csvFile([HEADER, row('609363220', 'cody'), row('609363220', 'cody')].join('\n'));
      const preview = await service.previewAllocationUpload(teamLead, PROJECT, file);
      expect(preview.rows[0].status).toBe('duplicate');
      expect(preview.rows[1].status).toBe('duplicate');
      expect(preview.duplicateRows).toBe(2);
      expect(preview.validRows).toBe(0);
    });
  });

  // ─── 13. Already actively allocated Chart ────────────────────────
  describe('already actively allocated Chart', () => {
    it('rejects a row allocating an already-actively-allocated Chart to a DIFFERENT Coder - use Reassign instead', async () => {
      prisma.chartAllocation.findMany.mockResolvedValueOnce([{ chartId: '609363220', coderId: 'someone-else' }]);
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      const preview = await service.previewAllocationUpload(teamLead, PROJECT, file);
      expect(preview.rows[0].status).toBe('invalid');
      expect(preview.rows[0].errors[0]).toMatch(/already actively allocated to another Coder/);
    });

    it('treats a re-upload allocating an already-actively-allocated Chart to the SAME Coder as a harmless no-op, not an error (rule 85)', async () => {
      prisma.chartAllocation.findMany.mockResolvedValueOnce([{ chartId: '609363220', coderId: coder.id }]);
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      const preview = await service.previewAllocationUpload(teamLead, PROJECT, file);
      expect(preview.rows[0].status).toBe('valid');
    });

    it('does NOT create a second allocation when the same chart+coder is committed again', async () => {
      prisma.chart.findMany.mockResolvedValueOnce([{ chartId: '609363220', projectId: PROJECT }]);
      prisma.chartAllocation.findMany.mockResolvedValueOnce([]); // preview-time cross-check: no active allocation yet
      prisma.chartAllocation.findMany.mockResolvedValueOnce([{ chartId: '609363220', coderId: coder.id }]); // commit's authoritative re-check
      prisma.user.findMany.mockResolvedValueOnce([CODER_ROW]).mockResolvedValueOnce([{ id: coder.id, loginName: 'cody' }]);
      tx.chartAllocationImport.create.mockResolvedValueOnce({ id: 'cai-2' });
      prisma.chartAllocationImport.findUniqueOrThrow.mockResolvedValueOnce({ id: 'cai-2', status: 'COMPLETED', successRows: 1, failedRows: 0 });

      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      const result = await service.commitAllocationUpload(teamLead, PROJECT, file);

      expect(tx.chartAllocation.create).not.toHaveBeenCalled();
      expect(tx.chart.update).not.toHaveBeenCalled();
      expect(result.successRows).toBe(1); // reported as a successful (idempotent) row, but nothing new was written
    });
  });

  // ─── 14. Entire-file rejection (all-or-nothing) ──────────────────
  describe('entire-file rejection', () => {
    it('rejects the ENTIRE upload when even one actionable row is invalid, even though other rows are valid - nothing is allocated', async () => {
      prisma.user.findMany.mockResolvedValueOnce([CODER_ROW]); // 'cody' exists; 'nobody' does not
      const file = csvFile([HEADER, row('609363220', 'cody'), row('609450011', 'nobody')].join('\n'));
      await expect(service.commitAllocationUpload(teamLead, PROJECT, file)).rejects.toThrow(BadRequestException);
      expect(tx.chartAllocation.create).not.toHaveBeenCalled();
      expect(prisma.chartAllocationImport.create.mock.calls[0][0].data.status).toBe('REJECTED');
      const rejectedLog = prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
      expect(rejectedLog).toContain('CHART_ALLOCATION_REJECTED');
    });

    it('rejects the ENTIRE upload when a duplicate ChartID coexists with otherwise-valid rows', async () => {
      const file = csvFile([HEADER, row('609363220', 'cody'), row('609363220', 'cody'), row('609999999', 'cody')].join('\n'));
      prisma.chart.findMany.mockResolvedValueOnce([{ chartId: '609363220', projectId: PROJECT }]); // 609999999 not found
      await expect(service.commitAllocationUpload(teamLead, PROJECT, file)).rejects.toThrow(BadRequestException);
      expect(tx.chartAllocation.create).not.toHaveBeenCalled();
    });
  });

  // ─── 16. Duplicate/concurrent allocation protection ──────────────
  describe('duplicate concurrent allocation protection', () => {
    it('reports a clear 409 (not a false success) when a concurrent commit trips the partial-unique-index race, and records a FAILED import', async () => {
      tx.chartAllocation.create.mockRejectedValueOnce(Object.assign(new Error(), { code: 'P2002' }));
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      await expect(service.commitAllocationUpload(teamLead, PROJECT, file)).rejects.toThrow(ConflictException);
      expect(prisma.chartAllocationImport.create.mock.calls[0][0].data.status).toBe('FAILED');
      const actions = prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
      expect(actions).toContain('CHART_ALLOCATION_FAILED');
    });

    it('never reports COMPLETED if the transaction fails for any other reason - rolls back, nothing is allocated', async () => {
      tx.chartAllocation.create.mockRejectedValueOnce(new Error('boom'));
      const file = csvFile([HEADER, row('609363220', 'cody')].join('\n'));
      await expect(service.commitAllocationUpload(teamLead, PROJECT, file)).rejects.toThrow('boom');
      expect(prisma.chartAllocationImport.create.mock.calls[0][0].data.status).toBe('FAILED');
    });
  });

  // ─── 17. Pullback ─────────────────────────────────────────────────
  describe('pullback', () => {
    beforeEach(() => {
      prisma.chartAllocation.findFirst.mockResolvedValue({ id: 'ca-1', chartId: '609363220', coderId: coder.id, loginNameSnapshot: 'cody', isActive: true });
    });

    it('ends the active allocation and clears Chart\'s current-assignment pointer, preserving history (isActive: false, not deleted)', async () => {
      const result = await service.pullback(manager, PROJECT, '609363220', {});
      expect(tx.chartAllocation.update).toHaveBeenCalledWith({
        where: { id: 'ca-1' },
        data: expect.objectContaining({ isActive: false, endReason: 'PULLED_BACK' }),
      });
      expect(tx.chart.update).toHaveBeenCalledWith({ where: { chartId: '609363220' }, data: { assignedCoderId: null, assignedById: null, assignedAt: null } });
      expect(result).toEqual({ chartId: '609363220', allocated: false });
      const actions = tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
      expect(actions).toContain('CHART_ALLOCATION_PULLED_BACK');
    });

    it('blocks pulling back a chart whose current production is COMPLETED', async () => {
      // Full ProductionEntry row (this call site has no `select`, so the
      // real Prisma Client returns every column) - only `.status` is read
      // by pullback(), but the fixture conforms to the generated type
      // rather than the minimal shape the code happens to use today.
      prisma.productionEntry.findFirst.mockResolvedValueOnce({
        id: 'pe-1',
        chartId: '609363220',
        coderId: coder.id,
        version: 1,
        isCurrent: true,
        pageCount: 10,
        totalDOS: 1,
        totalICDs: 1,
        status: 'COMPLETED',
        remarks: null,
        codedDate: new Date('2026-09-29T00:00:00.000Z'),
        createdAt: new Date('2026-09-29T00:00:00.000Z'),
        updatedAt: new Date('2026-09-29T00:00:00.000Z'),
      });
      await expect(service.pullback(manager, PROJECT, '609363220', {})).rejects.toThrow(ConflictException);
      expect(tx.chartAllocation.update).not.toHaveBeenCalled();
    });

    it('blocks pulling back a chart with a live (OPEN/IN_PROGRESS/RESOLVED) rework', async () => {
      prisma.rework.findFirst.mockResolvedValueOnce({ id: 'rw-1', status: 'OPEN' });
      await expect(service.pullback(manager, PROJECT, '609363220', {})).rejects.toThrow(/live rework/);
    });

    it('404s for a chart not in this Project', async () => {
      prisma.chart.findFirst.mockResolvedValueOnce(null);
      await expect(service.pullback(manager, PROJECT, 'no-such-chart', {})).rejects.toThrow(NotFoundException);
    });

    it('rejects pulling back a chart with no active allocation', async () => {
      prisma.chartAllocation.findFirst.mockResolvedValueOnce(null);
      await expect(service.pullback(manager, PROJECT, '609363220', {})).rejects.toThrow(ConflictException);
    });

    it('a Team Lead may pull back for their own Team\'s project; not for another Team\'s project', async () => {
      await expect(service.pullback(teamLead, PROJECT, '609363220', {})).resolves.toBeDefined();
      await expect(service.pullback(otherTeamLead, PROJECT, '609363220', {})).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── 18. Reassignment ─────────────────────────────────────────────
  describe('reassignment', () => {
    const newCoder = { id: 'c-2', loginName: 'newcoder', role: 'CODER', isActive: true, teamId: TEAM };

    beforeEach(() => {
      prisma.chartAllocation.findFirst.mockResolvedValue({ id: 'ca-1', chartId: '609363220', coderId: coder.id, loginNameSnapshot: 'cody', isActive: true });
      prisma.user.findUnique.mockResolvedValue(newCoder);
    });

    it('validates the new Coder BEFORE changing anything, then atomically ends the old allocation and creates a new one, preserving the previous allocation link', async () => {
      const result = await service.reassign(manager, PROJECT, '609363220', { loginName: 'newcoder' });
      expect(tx.chartAllocation.update).toHaveBeenCalledWith({
        where: { id: 'ca-1' },
        data: expect.objectContaining({ isActive: false, endReason: 'REASSIGNED' }),
      });
      expect(tx.chartAllocation.create.mock.calls[0][0].data).toMatchObject({ chartId: '609363220', coderId: 'c-2', loginNameSnapshot: 'newcoder', previousAllocationId: 'ca-1' });
      expect(tx.chart.update).toHaveBeenCalledWith({ where: { chartId: '609363220' }, data: { assignedCoderId: 'c-2', assignedById: manager.id, assignedAt: expect.any(Date) } });
      expect(result).toEqual({ chartId: '609363220', allocationId: 'ca-new' });
      const actions = tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
      expect(actions).toContain('CHART_REASSIGNED');
    });

    it('rejects reassigning to a nonexistent, inactive, non-Coder, or wrong-Team Login Name - and writes nothing', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.reassign(manager, PROJECT, '609363220', { loginName: 'nobody' })).rejects.toThrow(BadRequestException);
      prisma.user.findUnique.mockResolvedValueOnce({ ...newCoder, isActive: false });
      await expect(service.reassign(manager, PROJECT, '609363220', { loginName: 'newcoder' })).rejects.toThrow(BadRequestException);
      prisma.user.findUnique.mockResolvedValueOnce({ ...newCoder, role: 'TEAM_LEAD' });
      await expect(service.reassign(manager, PROJECT, '609363220', { loginName: 'newcoder' })).rejects.toThrow(BadRequestException);
      prisma.user.findUnique.mockResolvedValueOnce({ ...newCoder, teamId: OTHER_TEAM });
      await expect(service.reassign(manager, PROJECT, '609363220', { loginName: 'newcoder' })).rejects.toThrow(BadRequestException);
      expect(tx.chartAllocation.create).not.toHaveBeenCalled();
    });

    it('rejects reassigning to the Coder who already holds the active allocation', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...coder, id: coder.id, loginName: 'cody', role: 'CODER', isActive: true, teamId: TEAM });
      await expect(service.reassign(manager, PROJECT, '609363220', { loginName: 'cody' })).rejects.toThrow(ConflictException);
    });

    it('rejects reassigning a chart with no active allocation - it must be allocated first', async () => {
      prisma.chartAllocation.findFirst.mockResolvedValueOnce(null);
      await expect(service.reassign(manager, PROJECT, '609363220', { loginName: 'newcoder' })).rejects.toThrow(ConflictException);
    });
  });

  // ─── 19. Allocation history ───────────────────────────────────────
  describe('allocation history', () => {
    it('lists the append-only allocation ledger for a Project, most recent first', async () => {
      prisma.chartAllocation.findMany.mockResolvedValueOnce([
        {
          id: 'ca-1', chartId: '609363220', projectId: PROJECT,
          coder: { id: coder.id, fullName: 'Cody', employeeId: 'E1', loginName: 'cody' },
          loginNameSnapshot: 'cody', team: { id: TEAM, name: 'Team A' }, teamLead: null, assignedBy: null,
          assignedAt: new Date(), isActive: true, endedAt: null, endedBy: null, endReason: null, endNote: null, previousAllocationId: null,
        },
      ]);
      prisma.chartAllocation.count.mockResolvedValueOnce(1);
      const result = await service.listHistory(manager, PROJECT, { page: 1, pageSize: 25 } as any);
      expect(result.total).toBe(1);
      expect(result.data[0]).toMatchObject({ chartId: '609363220', isActive: true, loginNameSnapshot: 'cody' });
      expect(prisma.chartAllocation.findMany.mock.calls[0][0]).toMatchObject({ where: { projectId: PROJECT }, orderBy: { assignedAt: 'desc' } });
    });

    it('lists the Team Lead Summary-upload history for a Project', async () => {
      prisma.chartAllocationImport.findMany.mockResolvedValueOnce([
        { id: 'cai-1', fileName: 'summary.csv', fileType: 'CSV', status: 'COMPLETED', totalRows: 2, validRows: 2, invalidRows: 0, duplicateRows: 0, successRows: 2, failedRows: 0, importedAt: new Date(), importedBy: null },
      ]);
      prisma.chartAllocationImport.count.mockResolvedValueOnce(1);
      const result = await service.listImportHistory(manager, PROJECT, { page: 1, pageSize: 25 } as any);
      expect(result.total).toBe(1);
      expect(result.data[0].fileName).toBe('summary.csv');
    });
  });

  // ─── Manager/Team Lead dashboard metrics ─────────────────────────
  describe('metrics (raw counts, no invented formula)', () => {
    it('reports allocated/done/pending overall and per-Coder from actual database state', async () => {
      prisma.chartAllocation.findMany.mockResolvedValueOnce([
        { chartId: '609363220', coderId: coder.id, coder: { id: coder.id, fullName: 'Cody', employeeId: 'E1', loginName: 'cody' } },
        { chartId: '609450011', coderId: coder.id, coder: { id: coder.id, fullName: 'Cody', employeeId: 'E1', loginName: 'cody' } },
      ]);
      prisma.productionEntry.findMany.mockResolvedValueOnce([{ chartId: '609363220', status: 'COMPLETED' }]);
      const result = await service.metrics(manager, PROJECT);
      expect(result.allocated).toBe(2);
      expect(result.done).toBe(1);
      expect(result.pending).toBe(1);
      expect(result.byCoder[0]).toMatchObject({ allocated: 2, done: 1, pending: 1 });
    });
  });
});
