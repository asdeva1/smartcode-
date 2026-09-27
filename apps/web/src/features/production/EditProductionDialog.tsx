'use client';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Grid from '@mui/material/Grid';
import {
  PRODUCTION_TRANSITIONS,
  UpdateProductionSchema,
  type ProductionEntry,
  type ProductionStatus,
  type UpdateProductionInput,
} from '@smartcode/types';
import { Alert, Button, DatePicker, Input, Modal, Select, useToast } from '@smartcode/ui';
import { errorMessage, asInputRef } from '@/lib/format';
import { useUpdateProduction } from './use-production';

const LABEL: Record<string, string> = { PENDING: 'Pending', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', REWORK: 'Rework' };

/** Status options: the current status plus the transitions a Coder may make (cancel/rework have their own actions). */
export function statusOptionsFor(current: ProductionStatus) {
  const next = PRODUCTION_TRANSITIONS[current].filter((s) => s !== 'CANCELLED' && s !== 'REWORK');
  return [current, ...next].map((s) => ({ value: s, label: LABEL[s] ?? s }));
}

export function EditProductionDialog({ entry, onClose }: { entry: ProductionEntry | null; onClose: () => void }) {
  const { showToast } = useToast();
  const update = useUpdateProduction();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<UpdateProductionInput>({ resolver: zodResolver(UpdateProductionSchema) });

  React.useEffect(() => {
    if (entry) {
      setServerError(null);
      reset({
        pageCount: entry.pageCount,
        totalICDs: entry.totalICDs,
        totalDOS: entry.totalDOS,
        status: entry.status as UpdateProductionInput['status'],
        codedDate: entry.codedDate,
        remarks: entry.remarks ?? '',
      });
    }
  }, [entry, reset]);

  if (!entry) return null;

  const onSubmit = (data: UpdateProductionInput) =>
    update.mutate(
      { id: entry.id, input: data },
      {
        onSuccess: () => {
          showToast(`Chart ${entry.chartId} updated.`, 'success');
          onClose();
        },
        onError: (err) => setServerError(errorMessage(err, 'Could not update production.')),
      },
    );

  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      title={`Edit production - ${entry.chartId} (v${entry.version})`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={update.isPending}>
            {update.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      }
    >
      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError}
        </Alert>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Input label="Chart ID" value={entry.chartId} disabled />
          </Grid>
          <Grid item xs={4}>
            <Input label="Page Count" type="number" error={!!errors.pageCount} helperText={errors.pageCount?.message} {...register('pageCount', { valueAsNumber: true })} />
          </Grid>
          <Grid item xs={4}>
            <Input label="Total ICDs" type="number" error={!!errors.totalICDs} helperText={errors.totalICDs?.message} {...register('totalICDs', { valueAsNumber: true })} />
          </Grid>
          <Grid item xs={4}>
            <Input label="Total DOS" type="number" error={!!errors.totalDOS} helperText={errors.totalDOS?.message} {...register('totalDOS', { valueAsNumber: true })} />
          </Grid>
          <Grid item xs={6}>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select label="Status" value={field.value ?? entry.status} onChange={(e) => field.onChange(e.target.value)} options={statusOptionsFor(entry.status)} />
              )}
            />
          </Grid>
          <Grid item xs={6}>
            <DatePicker label="Coded Date" error={!!errors.codedDate} helperText={errors.codedDate?.message} {...asInputRef(register('codedDate'))} />
          </Grid>
          <Grid item xs={12}>
            <Input label="Remarks" multiline minRows={2} error={!!errors.remarks} helperText={errors.remarks?.message} {...register('remarks')} />
          </Grid>
        </Grid>
      </form>
    </Modal>
  );
}
