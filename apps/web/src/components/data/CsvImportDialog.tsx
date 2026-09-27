'use client';
import * as React from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableContainer from '@mui/material/TableContainer';
import { Upload } from 'lucide-react';
import {
  CSV_IMPORT_MAX_BYTES,
  type ImportCommitResponse,
  type ImportPreviewResponse,
  type ImportRowStatus,
} from '@smartcode/types';
import { Alert, Button, Modal, useToast } from '@smartcode/ui';
import { apiUpload } from '@/lib/api-client';
import { errorMessage } from '@/lib/format';

const STATUS_CHIP: Record<ImportRowStatus, { label: string; color: 'success' | 'error' | 'warning' }> = {
  valid: { label: 'Valid', color: 'success' },
  invalid: { label: 'Invalid', color: 'error' },
  duplicate: { label: 'Duplicate', color: 'warning' },
};

/** Client-side pre-checks only; the backend re-validates everything and is authoritative. */
export function checkCsvFile(file: File): string | null {
  if (!/\.csv$/i.test(file.name)) return 'Only .csv files can be imported. Excel and PDF files are not supported.';
  if (file.size === 0) return 'The file is empty.';
  if (file.size > CSV_IMPORT_MAX_BYTES) return `The file is too large (max ${CSV_IMPORT_MAX_BYTES / 1024 / 1024} MB).`;
  const type = (file.type || '').toLowerCase();
  if (type && !/csv|text\/plain|vnd\.ms-excel|octet-stream/.test(type)) return `Unsupported file type "${file.type}".`;
  return null;
}

type Step = 'select' | 'preview' | 'done';

/**
 * CSV-only import with a mandatory preview: choose file -> backend
 * validates every row (valid / invalid / duplicate, errors per row) ->
 * user confirms -> backend re-validates and commits valid rows in one
 * transaction -> success/failure summary. Nothing is written until the
 * user confirms.
 */
export function CsvImportDialog({
  open,
  onClose,
  title,
  previewPath,
  commitPath,
  headers,
  columns,
  templateRow,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  previewPath: string;
  commitPath: string;
  headers: readonly string[];
  /** Row fields shown in the preview table. */
  columns: string[];
  templateRow?: string[];
  onImported?: (result: ImportCommitResponse) => void;
}) {
  const { showToast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [step, setStep] = React.useState<Step>('select');
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = React.useState<ImportCommitResponse | null>(null);

  const reset = () => {
    setStep('select');
    setFile(null);
    setError(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };
  const close = () => {
    reset();
    onClose();
  };

  const choose = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    const problem = checkCsvFile(f);
    if (problem) {
      setError(problem);
      return;
    }
    setFile(f);
    setBusy(true);
    try {
      setPreview(await apiUpload<ImportPreviewResponse>(previewPath, f));
      setStep('preview');
    } catch (err) {
      setError(errorMessage(err, 'Could not validate the file.'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiUpload<ImportCommitResponse>(commitPath, file);
      setResult(res);
      setStep('done');
      showToast(`Imported ${res.imported} row(s).`, 'success');
      onImported?.(res);
    } catch (err) {
      setError(errorMessage(err, 'Import failed - nothing was imported.'));
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const lines = [headers.join(','), ...(templateRow ? [templateRow.join(',')] : [])];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actions =
    step === 'select' ? (
      <Button variant="text" onClick={close}>
        Cancel
      </Button>
    ) : step === 'preview' ? (
      <>
        <Button variant="text" onClick={reset} disabled={busy}>
          Choose another file
        </Button>
        <Button onClick={confirm} disabled={busy || !preview || preview.validRows === 0}>
          {busy ? 'Importing...' : `Import ${preview?.validRows ?? 0} valid row(s)`}
        </Button>
      </>
    ) : (
      <Button onClick={close}>Done</Button>
    );

  return (
    <Modal open={open} onClose={close} title={title} maxWidth="md" actions={actions}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {step === 'select' && (
        <Stack spacing={2}>
          <Typography variant="body2">
            Upload a <strong>CSV file</strong> (UTF-8, max {CSV_IMPORT_MAX_BYTES / 1024 / 1024} MB) with these columns:{' '}
            <code>{headers.join(', ')}</code>. You will see a row-by-row preview before anything is imported.
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button component="label" startIcon={<Upload size={16} />} disabled={busy}>
              {busy ? 'Validating...' : 'Choose CSV file'}
              <input
                ref={inputRef}
                hidden
                type="file"
                accept=".csv,text/csv"
                aria-label="CSV file"
                onChange={(e) => choose(e.target.files?.[0])}
              />
            </Button>
            <Button variant="text" onClick={downloadTemplate}>
              Download template
            </Button>
          </Stack>
        </Stack>
      )}

      {step !== 'select' && preview && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Typography variant="body2" sx={{ mr: 1 }}>
              <strong>{preview.fileName}</strong> - {preview.totalRows} row(s):
            </Typography>
            <Chip size="small" color="success" label={`${preview.validRows} valid`} />
            <Chip size="small" color="error" label={`${preview.invalidRows} invalid`} />
            <Chip size="small" color="warning" label={`${preview.duplicateRows} duplicate`} />
          </Stack>
          {step === 'done' && result && (
            <Alert severity="success">
              Import complete: {result.imported} imported, {result.skipped} skipped.
            </Alert>
          )}
          {step === 'preview' && preview.validRows === 0 && (
            <Alert severity="warning">No valid rows - fix the errors below and upload the file again.</Alert>
          )}
          {step === 'preview' && preview.validRows > 0 && preview.validRows < preview.totalRows && (
            <Alert severity="info">Only the valid rows will be imported; invalid and duplicate rows are skipped.</Alert>
          )}
          <TableContainer sx={{ maxHeight: 360, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Row</TableCell>
                  <TableCell>Result</TableCell>
                  {columns.map((c) => (
                    <TableCell key={c}>{c}</TableCell>
                  ))}
                  <TableCell>Errors</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.rows.map((r) => (
                  <TableRow key={r.rowNumber}>
                    <TableCell>{r.rowNumber}</TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" color={STATUS_CHIP[r.status].color} label={STATUS_CHIP[r.status].label} />
                    </TableCell>
                    {columns.map((c) => (
                      <TableCell key={c}>{r.data[c] ?? ''}</TableCell>
                    ))}
                    <TableCell>
                      {r.errors.length ? (
                        <Box component="ul" sx={{ m: 0, pl: 2 }}>
                          {r.errors.map((e) => (
                            <li key={e}>
                              <Typography variant="caption" color="error">
                                {e}
                              </Typography>
                            </li>
                          ))}
                        </Box>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}
    </Modal>
  );
}
