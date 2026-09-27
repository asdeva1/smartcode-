import { Injectable, BadRequestException, StreamableFile } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { EXPORT_FORMATS, type ExportFormat } from '@smartcode/types';
import { sanitizeCell, toCsv } from '../csv/csv';

export interface ExportColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface ExportRequest {
  /** Human title, e.g. "Team Coders". Also drives the filename. */
  title: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  /** Applied filters, printed in the file so the reader knows its scope. */
  filters?: Record<string, string | number | boolean | null | undefined>;
  generatedBy?: string;
  now?: Date;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

export function parseExportFormat(value: unknown): ExportFormat {
  const v = String(value ?? '').toLowerCase();
  if (!(EXPORT_FORMATS as readonly string[]).includes(v)) {
    throw new BadRequestException(`format must be one of: ${EXPORT_FORMATS.join(', ')}`);
  }
  return v as ExportFormat;
}

function stamp(now: Date) {
  const iso = now.toISOString();
  return { file: iso.slice(0, 16).replace(/[-:]/g, '').replace('T', '-'), display: `${iso.slice(0, 19).replace('T', ' ')} UTC` };
}

export function exportFileName(title: string, format: ExportFormat, now: Date = new Date()): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
  return `smartcode-${slug}-${stamp(now).file}.${format}`;
}

function filterSummary(filters: ExportRequest['filters']): string {
  const parts = Object.entries(filters ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(' | ') : 'none';
}

/**
 * Builds CSV / Excel / PDF files from rows the calling service has
 * already scoped by role and filters. This service never queries data
 * itself, so it cannot widen what a caller is authorised to see.
 */
@Injectable()
export class ExportService {
  async build(format: ExportFormat, req: ExportRequest): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
    const now = req.now ?? new Date();
    const buffer =
      format === 'csv' ? this.csv(req, now) : format === 'xlsx' ? await this.xlsx(req, now) : await this.pdf(req, now);
    return { buffer, fileName: exportFileName(req.title, format, now), contentType: CONTENT_TYPES[format] };
  }

  async stream(format: ExportFormat, req: ExportRequest): Promise<StreamableFile> {
    const file = await this.build(format, req);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.length,
    });
  }

  private values(req: ExportRequest): unknown[][] {
    return req.rows.map((row) => req.columns.map((c) => row[c.key] ?? ''));
  }

  private csv(req: ExportRequest, now: Date): Buffer {
    const meta = [
      `# ${req.title}`,
      `# Generated: ${stamp(now).display}${req.generatedBy ? ` by ${req.generatedBy}` : ''}`,
      `# Filters: ${filterSummary(req.filters)}`,
    ]
      .map((l) => `"${l.replace(/"/g, '""')}"`)
      .join('\r\n');
    const body = toCsv(
      req.columns.map((c) => c.label),
      this.values(req),
    );
    // BOM so Excel on Windows opens UTF-8 correctly.
    return Buffer.from(`﻿${meta}\r\n${body}`, 'utf8');
  }

  private async xlsx(req: ExportRequest, now: Date): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SmartCode';
    wb.created = now;
    const ws = wb.addWorksheet(req.title.slice(0, 31) || 'Export');
    ws.addRow([req.title]).font = { bold: true, size: 13 };
    ws.addRow([`Generated: ${stamp(now).display}${req.generatedBy ? ` by ${req.generatedBy}` : ''}`]);
    ws.addRow([`Filters: ${filterSummary(req.filters)}`]);
    ws.addRow([]);
    const header = ws.addRow(req.columns.map((c) => c.label));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
    });
    for (const row of this.values(req)) {
      ws.addRow(row.map((v) => (typeof v === 'number' ? v : sanitizeCell(v))));
    }
    req.columns.forEach((c, i) => {
      ws.getColumn(i + 1).width = Math.min(40, Math.max(12, c.label.length + 4));
    });
    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  }

  private pdf(req: ExportRequest, now: Date): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.font('Helvetica-Bold').fontSize(14).text(req.title);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#555555')
        .text(`Generated: ${stamp(now).display}${req.generatedBy ? ` by ${req.generatedBy}` : ''}`)
        .text(`Filters: ${filterSummary(req.filters)}`)
        .text(`Rows: ${req.rows.length}`)
        .fillColor('#000000');
      doc.moveDown(0.6);

      const left = doc.page.margins.left;
      const usable = doc.page.width - left - doc.page.margins.right;
      const colWidth = usable / Math.max(1, req.columns.length);
      const rowHeight = 16;
      const bottom = () => doc.page.height - doc.page.margins.bottom;

      const drawRow = (cells: string[], bold: boolean) => {
        if (doc.y + rowHeight > bottom()) doc.addPage();
        const y = doc.y;
        if (bold) doc.rect(left, y - 2, usable, rowHeight).fill('#E8EEF5').fillColor('#000000');
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5);
        cells.forEach((text, i) => {
          doc.text(text, left + i * colWidth + 2, y, { width: colWidth - 4, height: rowHeight - 2, ellipsis: true, lineBreak: false });
        });
        doc.x = left;
        doc.y = y + rowHeight;
      };

      drawRow(req.columns.map((c) => c.label), true);
      for (const row of this.values(req)) drawRow(row.map((v) => (v === null || v === undefined ? '' : String(v))), false);
      if (req.rows.length === 0) doc.font('Helvetica-Oblique').fontSize(9).text('No records match the current filters.', left);
      doc.end();
    });
  }
}
