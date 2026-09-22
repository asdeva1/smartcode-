'use client';
import Chip from '@mui/material/Chip';
import type { ProductionStatus, AuditStatus } from '@smartcode/types';
import { colors } from '../tokens/tokens';

type Status = ProductionStatus | AuditStatus;

/**
 * Maps every Production/Audit status to one consistent visual treatment.
 * This is the ONLY place status -> color mapping happens - see
 * docs/05-FRONTEND-ARCHITECTURE.md "Design System" note on StatusBadge.
 */
const STATUS_TOKEN_MAP: Record<Status, keyof typeof colors.status> = {
  PENDING: 'pending',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
  REWORK: 'rework',
  CANCELLED: 'cancelled',
  REVIEW_REQUIRED: 'reviewRequired',
  REJECTED: 'rejected',
};

const STATUS_LABEL_MAP: Record<Status, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  REWORK: 'Rework',
  CANCELLED: 'Cancelled',
  REVIEW_REQUIRED: 'Review Required',
  REJECTED: 'Rejected',
};

export interface StatusBadgeProps {
  status: Status;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const token = colors.status[STATUS_TOKEN_MAP[status]];
  return (
    <Chip
      label={STATUS_LABEL_MAP[status]}
      size="small"
      sx={{
        backgroundColor: token.bg,
        color: token.fg,
        border: `1px solid ${token.border}`,
      }}
    />
  );
}
