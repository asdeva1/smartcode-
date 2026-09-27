'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import type { ChartAuditState } from '@smartcode/types';
import { StatusBadge } from '@smartcode/ui';

export function AuditStateBadge({ state }: { state: ChartAuditState }) {
  return state === 'NOT_AUDITED' ? <Chip label="Not audited" size="small" variant="outlined" /> : <StatusBadge status={state} />;
}
