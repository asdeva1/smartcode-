'use client';
import * as React from 'react';
import { Alert, Button, DataTable, Select, useToast } from '@smartcode/ui';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import type { ChartAllocationPreviewResponse } from '@smartcode/types';
import { useMyProjects } from '@/features/production/use-production';
import { formatDateTime } from '@/lib/format';
import { useChartAllocationImportHistory, useCommitChartAllocationUpload, usePreviewChartAllocationUpload } from './use-chart-allocation';

/**
 * Team Lead Chart Allocation upload workspace (docs/09-BUSINESS-RULES.md
 * section 12, Phase 10D). Rendered as its own tab on the Team Lead Charts
 * page, alongside (not replacing) the existing Chart Repository tab.
 *
 * Flow: download the Manager's Summary export (outside this app), fill in
 * "Assigned to" with each Coder's Login Name, then upload it here. Preview
 * validates every row without writing anything; Commit is all-or-nothing -
 * if any row is invalid or duplicate, the entire upload is rejected and
 * nothing is allocated.
 */
export function TeamLeadAllocationUpload() {
  const { showToast } = useToast();
  const { data: projects } = useMyProjects();
  const [projectId, setProjectId] = React.useState<string>('');
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<ChartAllocationPreviewResponse | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const previewMutation = usePreviewChartAllocationUpload();
  const commitMutation = useCommitChartAllocationUpload();
  const importHistory = useChartAllocationImportHistory(projectId || null, { page: 1, pageSize: 10 });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPreview(null);
    setFile(e.target.files?.[0] ?? null);
  };

  const handlePreview = async () => {
    if (!projectId || !file) return;
    try {
      const result = await previewMutation.mutateAsync({ projectId, file });
      setPreview(result);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Preview failed', 'error');
    }
  };

  const handleCommit = async () => {
    if (!projectId || !file) return;
    try {
      const result = await commitMutation.mutateAsync({ projectId, file });
      showToast(`Allocated ${result.successRows} chart(s)`, 'success');
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The upload was rejected - fix the flagged rows and try again', 'error');
    }
  };

  const canCommit = preview !== null && preview.invalidRows === 0 && preview.duplicateRows === 0 && preview.validRows > 0;

  return (
    <Stack spacing={2}>
      <Select
        label="Project"
        value={projectId}
        onChange={(e) => {
          setProjectId(e.target.value);
          setPreview(null);
          setFile(null);
        }}
        options={[{ value: '', label: 'Select a project…' }, ...(projects ?? []).map((p) => ({ value: p.id, label: p.name }))]}
        sx={{ maxWidth: 320 }}
      />

      {projectId && (
        <Stack spacing={1}>
          <Alert severity="info">
            Upload the Summary file your Manager exported, with "Assigned to" filled in for the Coder Login Name on each row you want to
            allocate. Rows left blank are skipped. If any filled-in row is invalid, the entire upload is rejected - nothing is allocated.
          </Alert>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx" onChange={onFileChange} />
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" disabled={!file || previewMutation.isPending} onClick={handlePreview}>
              Preview
            </Button>
            <Button disabled={!canCommit || commitMutation.isPending} onClick={handleCommit}>
              Commit allocation
            </Button>
          </Stack>
        </Stack>
      )}

      {preview && (
        <>
          <Stack direction="row" spacing={2}>
            <Chip label={`Total: ${preview.totalRows}`} />
            <Chip label={`Valid: ${preview.validRows}`} color="success" />
            <Chip label={`Invalid: ${preview.invalidRows}`} color="error" />
            <Chip label={`Duplicate: ${preview.duplicateRows}`} color="warning" />
          </Stack>
          <DataTable
            rows={preview.rows}
            rowKey={(r) => String(r.rowNumber)}
            emptyTitle="No rows with an Assigned-to Login Name found"
            columns={[
              { key: 'row', header: 'Row', render: (r) => r.rowNumber },
              { key: 'chartId', header: 'Chart ID', render: (r) => r.chartId },
              { key: 'loginName', header: 'Assigned to', render: (r) => r.loginName },
              { key: 'status', header: 'Status', render: (r) => r.status },
              { key: 'errors', header: 'Errors', render: (r) => r.errors.join('; ') || '—' },
            ]}
          />
        </>
      )}

      {importHistory.data && importHistory.data.data?.length > 0 && (
        <>
          <h3 style={{ margin: '8px 0 0' }}>Recent Summary uploads</h3>
          <DataTable
            rows={importHistory.data.data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'fileName', header: 'File', render: (r) => r.fileName },
              { key: 'status', header: 'Status', render: (r) => r.status },
              { key: 'successRows', header: 'Allocated', render: (r) => r.successRows },
              { key: 'importedAt', header: 'Uploaded at', render: (r) => formatDateTime(r.importedAt) },
            ]}
          />
        </>
      )}
    </Stack>
  );
}
