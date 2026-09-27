'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Search } from 'lucide-react';
import { z } from 'zod';
import {
  ChartIdSchema,
  ReauditSchema,
  ReworkReasonSchema,
  calculateTotalErrors,
  type AuditEntry,
  type ChartProductionLookup,
} from '@smartcode/types';
import { Alert, Button, DataTable, DatePicker, ErrorState, FormSection, Input, LoadingState, StatusBadge, useToast } from '@smartcode/ui';
import { useCurrentUser } from '@/features/auth/use-auth';
import { errorMessage, formatDate, personName, todayLocal, asInputRef } from '@/lib/format';
import { useChartLookup, useSubmitAudit } from './use-audits';

/** Form fields only - status comes from which button is pressed. */
const AuditFormSchema = ReauditSchema.omit({ status: true, totalErrors: true });
type AuditFormValues = z.infer<typeof AuditFormSchema>;

type SubmitStatus = 'IN_PROGRESS' | 'COMPLETED' | 'REVIEW_REQUIRED' | 'REJECTED';
const BUTTONS: { status: SubmitStatus; label: string; variant: 'contained' | 'outlined'; color?: 'warning' | 'error' }[] = [
  { status: 'IN_PROGRESS', label: 'Save Audit', variant: 'outlined' },
  { status: 'REVIEW_REQUIRED', label: 'Review Required', variant: 'outlined', color: 'warning' },
  { status: 'REJECTED', label: 'Rework', variant: 'outlined', color: 'error' },
  { status: 'COMPLETED', label: 'Complete Audit', variant: 'contained' },
];

function ReadOnly({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Grid item xs={12} sm={6} md={3}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600} component="div">
        {value}
      </Typography>
    </Grid>
  );
}

/**
 * Auditor enters a Chart ID; the backend returns the chart's CURRENT
 * production version, shown read-only. The Auditor enters only audit
 * fields. Total Errors is displayed as Audit Errors + Error Exceptions
 * for convenience but is never submitted - the server computes and
 * stores the authoritative value.
 */
export function AuditEntryWorkspace({ initialChartId }: { initialChartId?: string }) {
  const router = useRouter();
  const [input, setInput] = React.useState(initialChartId ?? '');
  const [inputError, setInputError] = React.useState<string | null>(null);
  const [chartId, setChartId] = React.useState<string | null>(initialChartId || null);
  const lookup = useChartLookup(chartId);

  const fetchChart = (e?: React.FormEvent) => {
    e?.preventDefault();
    const parsed = ChartIdSchema.safeParse(input);
    if (!parsed.success) {
      setInputError(parsed.error.issues[0].message);
      return;
    }
    setInputError(null);
    setChartId(parsed.data);
    router.replace(`/auditor/audit-entry?chartId=${encodeURIComponent(parsed.data)}`);
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <form onSubmit={fetchChart} noValidate>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Input
              label="Chart ID"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              error={!!inputError}
              helperText={inputError ?? 'Enter a Chart ID from your assigned projects'}
              sx={{ maxWidth: 320 }}
            />
            <Button type="submit" startIcon={<Search size={16} />}>
              Fetch
            </Button>
          </Stack>
        </form>
      </Paper>

      {chartId && lookup.isLoading && <LoadingState label="Fetching production..." />}
      {chartId && lookup.isError && (
        <ErrorState title="Chart not available" description={errorMessage(lookup.error, 'Could not fetch this chart.')} onRetry={() => lookup.refetch()} />
      )}
      {lookup.data && <LookupResult key={`${lookup.data.chartId}-${lookup.data.production.version}-${lookup.data.audits.length}`} data={lookup.data} />}
    </Stack>
  );
}

function LookupResult({ data }: { data: ChartProductionLookup }) {
  const { user } = useCurrentUser();
  const { production } = data;
  const openAudit = data.audits.find((a) => a.id === data.openAuditId) ?? null;
  const mode: 'create' | 'update' | 'reaudit' | null = data.canAudit ? 'create' : openAudit ? 'update' : data.reauditTargetId ? 'reaudit' : null;

  return (
    <>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <FormSection title={`Production - chart ${data.chartId} (version ${production.version})`} description="Retrieved automatically from the current production record. Read-only.">
          <Grid container spacing={2}>
            <ReadOnly label="Coder Name" value={personName(production.coder)} />
            <ReadOnly label="Employee ID" value={production.coder.employeeId} />
            <ReadOnly label="Login Name" value={production.coder.loginName} />
            <ReadOnly label="Project" value={data.project?.name ?? '—'} />
            <ReadOnly label="Page Count" value={production.pageCount} />
            <ReadOnly label="Total DOS" value={production.totalDOS} />
            <ReadOnly label="Total ICDs" value={production.totalICDs} />
            <ReadOnly label="Coded Date" value={formatDate(production.codedDate)} />
            <ReadOnly label="Production Status" value={<StatusBadge status={production.status} />} />
          </Grid>
        </FormSection>
      </Paper>

      {data.rework && (
        <Alert severity="info">
          This version is the Coder&apos;s correction of an earlier rework ({data.rework.status.toLowerCase().replace('_', ' ')}). Reason was:{' '}
          <strong>{data.rework.reason}</strong>
          {data.rework.resolutionNote ? ` - Coder: ${data.rework.resolutionNote}` : ''}
        </Alert>
      )}

      {mode ? (
        <AuditForm
          mode={mode}
          chartId={data.chartId}
          existing={mode === 'update' ? openAudit : null}
          targetId={mode === 'update' ? openAudit!.id : mode === 'reaudit' ? data.reauditTargetId : null}
          auditorLabel={`${user?.fullName ?? user?.loginName ?? ''} (${user?.employeeId ?? ''})`}
        />
      ) : (
        <Alert severity="info">{data.reason ?? 'This chart cannot be audited right now.'}</Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
          Audit history for this version
        </Typography>
        <DataTable<AuditEntry>
          rows={data.audits}
          rowKey={(a) => a.id}
          emptyTitle="Not audited yet"
          columns={[
            { key: 'auditDate', header: 'Audit Date', render: (a) => formatDate(a.auditDate) },
            { key: 'auditor', header: 'Auditor', render: (a) => personName(a.auditor) },
            { key: 'auditErrors', header: 'Audit Errors', align: 'right', render: (a) => a.auditErrors },
            { key: 'errorExceptions', header: 'Error Exceptions', align: 'right', render: (a) => a.errorExceptions },
            { key: 'totalErrors', header: 'Total Errors', align: 'right', render: (a) => a.totalErrors },
            { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
            { key: 'remarks', header: 'Remarks', render: (a) => a.remarks ?? '—' },
          ]}
        />
      </Paper>
    </>
  );
}

function AuditForm({
  mode,
  chartId,
  existing,
  targetId,
  auditorLabel,
}: {
  mode: 'create' | 'update' | 'reaudit';
  chartId: string;
  existing: AuditEntry | null;
  targetId: string | null;
  auditorLabel: string;
}) {
  const { showToast } = useToast();
  const submit = useSubmitAudit();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<AuditFormValues>({
    resolver: zodResolver(AuditFormSchema),
    defaultValues: existing
      ? { auditErrors: existing.auditErrors, errorExceptions: existing.errorExceptions, auditDate: existing.auditDate, remarks: existing.remarks ?? '' }
      : { auditErrors: 0, errorExceptions: 0, auditDate: todayLocal(), remarks: '' },
  });
  const [a, b] = watch(['auditErrors', 'errorExceptions']);
  const displayTotal = Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 ? calculateTotalErrors(a, b) : '—';

  const send = (status: SubmitStatus) =>
    handleSubmit((values) => {
      setServerError(null);
      // "Rework" sends the chart back to the Coder - the reason is mandatory (the server enforces it too).
      if (status === 'REJECTED') {
        const reason = ReworkReasonSchema.safeParse(values.remarks ?? '');
        if (!reason.success) {
          setError('remarks', { message: reason.error.issues[0].message });
          return;
        }
      }
      const input = { ...values, status, remarks: values.remarks || undefined };
      const req =
        mode === 'create'
          ? { kind: 'create' as const, input: { ...input, chartId } }
          : mode === 'update'
            ? { kind: 'update' as const, id: targetId!, input }
            : { kind: 'reaudit' as const, id: targetId!, input };
      submit.mutate(req, {
        onSuccess: (saved) =>
          showToast(`Audit for chart ${chartId} saved as ${saved.status.replace('_', ' ').toLowerCase()} - total errors ${saved.totalErrors}.`, 'success'),
        onError: (err) => setServerError(errorMessage(err, 'Could not save the audit.')),
      });
    })();

  const title = mode === 'create' ? 'New audit' : mode === 'update' ? 'Continue your audit' : 'Re-audit (the rejected audit is kept in history)';

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <FormSection title={title} description={`Auditor: ${auditorLabel} (from your login)`}>
        {serverError && <Alert severity="error">{serverError}</Alert>}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Input label="Audit Errors" type="number" inputProps={{ min: 0 }} error={!!errors.auditErrors} helperText={errors.auditErrors?.message} {...register('auditErrors', { valueAsNumber: true })} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Input label="Error Exceptions" type="number" inputProps={{ min: 0 }} error={!!errors.errorExceptions} helperText={errors.errorExceptions?.message} {...register('errorExceptions', { valueAsNumber: true })} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Input label="Total Number of Errors" value={displayTotal} disabled helperText="Calculated by the server on save" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <DatePicker label="Audit Date" error={!!errors.auditDate} helperText={errors.auditDate?.message} {...asInputRef(register('auditDate'))} />
          </Grid>
          <Grid item xs={12} sm={8}>
            <Input
              label="Remarks"
              multiline
              minRows={2}
              error={!!errors.remarks}
              helperText={errors.remarks?.message ?? 'Required as the rework reason when you choose Rework'}
              {...register('remarks')}
            />
          </Grid>
        </Grid>
        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
          {BUTTONS.map((btn) => (
            <Button key={btn.status} variant={btn.variant} color={btn.color} disabled={submit.isPending} onClick={() => send(btn.status)}>
              {btn.label}
            </Button>
          ))}
        </Stack>
      </FormSection>
    </Paper>
  );
}
