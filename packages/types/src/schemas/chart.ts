import type { AuditStatus, ProductionStatus } from '../status';
import type { PersonRef } from './common';
import type { AuditEntry } from './audit';
import type { ProductionEntry, ProjectRef } from './production';

/** Audit state of a chart's current production version. */
export type ChartAuditState = AuditStatus | 'NOT_AUDITED';

export interface ChartSummary {
  chartId: string;
  project: ProjectRef | null;
  teamName: string | null;
  currentVersion: number | null;
  productionStatus: ProductionStatus | null;
  coder: PersonRef | null;
  codedDate: string | null;
  auditState: ChartAuditState;
  latestTotalErrors: number | null;
  isRework: boolean;
  assignedCoderId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ChartListResponse {
  data: ChartSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChartDetail extends ChartSummary {
  productionHistory: ProductionEntry[];
  auditHistory: AuditEntry[];
}
