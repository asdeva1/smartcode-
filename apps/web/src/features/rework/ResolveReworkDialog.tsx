'use client';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Grid from '@mui/material/Grid';
import { ResolveReworkSchema, type ResolveReworkInput, type Rework } from '@smartcode/types';
import { Alert, Button, DatePicker, Input, Modal, useToast } from '@smartcode/ui';
import { asInputRef, errorMessage } from '@/lib/format';
import { useResolveRework } from './use-rework';

/**
 * Coder corrects the production values and says what was fixed. The
 * audited version stays in history; the server creates / completes the
 * corrected version and notifies the Team Lead and Auditor.
 */
export function ResolveReworkDialog({ rework, onClose }: { rework: Rework; onClose: () => void }) {
  const { showToast } = useToast();
  const resolve = useResolveRework();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const src = rework.originalProduction;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResolveReworkInput>({
    resolver: zodResolver(ResolveReworkSchema),
    defaultValues: {
      pageCount: src.pageCount,
      totalICDs: src.totalICDs,
      totalDOS: src.totalDOS,
      codedDate: src.codedDate,
      remarks: src.remarks ?? '',
      resolutionNote: '',
    },
  });

  const onSubmit = (input: ResolveReworkInput) => {
    setServerError(null);
    resolve.mutate(
      { id: rework.id, input: { ...input, remarks: input.remarks || undefined } },
      {
        onSuccess: () => {
          showToast(`Rework for chart ${rework.chartId} resolved - sent for re-audit.`, 'success');
          onClose();
        },
        onError: (err) => setServerError(errorMessage(err, 'Could not resolve this rework.')),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Resolve rework - ${rework.chartId}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={resolve.isPending}>
            {resolve.isPending ? 'Submitting...' : 'Submit correction'}
          </Button>
        </>
      }
    >
      <Alert severity="warning" sx={{ mb: 2 }}>
        Rework reason from {rework.auditor.fullName ?? rework.auditor.loginName}: {rework.reason}
      </Alert>
      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError}
        </Alert>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Input label="Page Count" type="number" error={!!errors.pageCount} helperText={errors.pageCount?.message} {...register('pageCount', { valueAsNumber: true })} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Input label="Total ICDs" type="number" error={!!errors.totalICDs} helperText={errors.totalICDs?.message} {...register('totalICDs', { valueAsNumber: true })} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Input label="Total DOS" type="number" error={!!errors.totalDOS} helperText={errors.totalDOS?.message} {...register('totalDOS', { valueAsNumber: true })} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <DatePicker label="Coded Date" error={!!errors.codedDate} helperText={errors.codedDate?.message} {...asInputRef(register('codedDate'))} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Input label="Remarks" error={!!errors.remarks} helperText={errors.remarks?.message} {...register('remarks')} />
          </Grid>
          <Grid item xs={12}>
            <Input
              label="What was corrected"
              multiline
              minRows={2}
              error={!!errors.resolutionNote}
              helperText={errors.resolutionNote?.message ?? 'Visible to your Team Lead and the Auditor'}
              {...register('resolutionNote')}
            />
          </Grid>
        </Grid>
      </form>
    </Modal>
  );
}
