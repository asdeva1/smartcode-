import { z } from 'zod';
import type { ProductionStatus } from '../status';
import { ChartIdSchema, PastOrTodayDateSchema, RemarksSchema, countField, type PersonRef } from './common';

/** Statuses a Coder may choose when first entering production. */
export const PRODUCTION_CREATE_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;

/**
 * Production entry. Coder identity (name, employee ID, login name) is
 * never part of this schema - the backend takes it from the session.
 */
export const CreateProductionSchema = z.object({
  chartId: ChartIdSchema,
  projectId: z.string().uuid('Select a project').optional(),
  pageCount: countField('Page count', 1),
  totalICDs: countField('Total ICDs'),
  totalDOS: countField('Total DOS'),
  status: z.enum(PRODUCTION_CREATE_STATUSES, { errorMap: () => ({ message: 'Select a valid status' }) }),
  remarks: RemarksSchema,
  codedDate: PastOrTodayDateSchema('Coded date'),
});
export type CreateProductionInput = z.infer<typeof CreateProductionSchema>;

/** Editable while the current version is PENDING, IN_PROGRESS or REWORK. Chart ID is fixed. */
export const UpdateProductionSchema = z.object({
  pageCount: countField('Page count', 1).optional(),
  totalICDs: countField('Total ICDs').optional(),
  totalDOS: countField('Total DOS').optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REWORK']).optional(),
  remarks: RemarksSchema,
  codedDate: PastOrTodayDateSchema('Coded date').optional(),
});
export type UpdateProductionInput = z.infer<typeof UpdateProductionSchema>;

export interface ProjectRef {
  id: string;
  name: string;
  client: { id: string; name: string } | null;
}

export interface ProductionEntry {
  id: string;
  chartId: string;
  version: number;
  isCurrent: boolean;
  pageCount: number;
  totalDOS: number;
  totalICDs: number;
  status: ProductionStatus;
  remarks: string | null;
  codedDate: string;
  createdAt: string;
  updatedAt: string;
  coder: PersonRef;
  project: ProjectRef | null;
  /** Number of audits recorded against this version. */
  auditCount: number;
}

export interface ProductionListResponse {
  data: ProductionEntry[];
  total: number;
  page: number;
  pageSize: number;
}
