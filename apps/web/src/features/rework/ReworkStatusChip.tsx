'use client';
import Chip from '@mui/material/Chip';
import { REWORK_STATUS_LABELS, type ReworkStatus } from '@smartcode/types';

const COLOR: Record<ReworkStatus, 'error' | 'warning' | 'info' | 'success' | 'default'> = {
  OPEN: 'error',
  IN_PROGRESS: 'warning',
  RESOLVED: 'info',
  REAUDITED: 'success',
  WITHDRAWN: 'default',
};

export function ReworkStatusChip({ status }: { status: ReworkStatus }) {
  return <Chip size="small" variant="outlined" color={COLOR[status]} label={REWORK_STATUS_LABELS[status]} />;
}
