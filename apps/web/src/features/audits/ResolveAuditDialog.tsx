'use client';
import * as React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { AuditEntry } from '@smartcode/types';
import { Alert, Button, Input, Modal, Select, useToast } from '@smartcode/ui';
import { errorMessage } from '@/lib/format';
import { useResolveAudit } from './use-audits';

/** Team Lead / Manager resolves a REVIEW_REQUIRED audit to COMPLETED or REJECTED (REJECTED triggers rework). */
export function ResolveAuditDialog({ audit, onClose }: { audit: AuditEntry | null; onClose: () => void }) {
  const { showToast } = useToast();
  const resolve = useResolveAudit();
  const [status, setStatus] = React.useState<'COMPLETED' | 'REJECTED'>('COMPLETED');
  const [remarks, setRemarks] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setStatus('COMPLETED');
    setRemarks(audit?.remarks ?? '');
    setError(null);
  }, [audit]);

  if (!audit) return null;

  const submit = () =>
    resolve.mutate(
      { id: audit.id, input: { status, remarks: remarks || undefined } },
      {
        onSuccess: () => {
          showToast(`Audit for chart ${audit.chartId} resolved as ${status === 'COMPLETED' ? 'Completed' : 'Rejected'}.`, 'success');
          onClose();
        },
        onError: (err) => setError(errorMessage(err, 'Could not resolve the audit.')),
      },
    );

  return (
    <Modal
      open={!!audit}
      onClose={onClose}
      title={`Resolve review - ${audit.chartId}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={resolve.isPending}>
            {resolve.isPending ? 'Saving...' : 'Resolve'}
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="body2">
          Audit errors {audit.auditErrors} + exceptions {audit.errorExceptions} = <strong>{audit.totalErrors} total errors</strong>
        </Typography>
        <Select
          label="Resolution"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          options={[
            { value: 'COMPLETED', label: 'Completed - accept the audit' },
            { value: 'REJECTED', label: 'Rejected - production needs rework' },
          ]}
        />
        <Input label="Remarks" multiline minRows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Stack>
    </Modal>
  );
}
