'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { CreateProductionSchema, type CreateProductionInput } from '@smartcode/types';
import { Alert, Button, DatePicker, FormSection, Input, Select, useToast } from '@smartcode/ui';
import { useCurrentUser } from '@/features/auth/use-auth';
import { errorMessage, todayLocal, asInputRef } from '@/lib/format';
import { useCreateProduction, useMyProjects } from './use-production';

/**
 * Production entry. Coder Name / Employee ID / Login Name are displayed
 * read-only from the authenticated session and are never sent - the
 * backend takes the coder from the session token.
 */
export function ProductionForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useCurrentUser();
  const projects = useMyProjects();
  const create = useCreateProduction();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateProductionInput>({
    resolver: zodResolver(CreateProductionSchema),
    defaultValues: { status: 'COMPLETED', codedDate: todayLocal(), remarks: '' },
  });

  const projectOptions = projects.data ?? [];

  const onSubmit = (data: CreateProductionInput) => {
    setServerError(null);
    create.mutate(
      { ...data, remarks: data.remarks || undefined, projectId: data.projectId || undefined },
      {
        onSuccess: (entry) => {
          showToast(`Production saved for chart ${entry.chartId}.`, 'success');
          reset({ status: 'COMPLETED', codedDate: todayLocal(), remarks: '', projectId: data.projectId });
          router.push('/coder/production');
        },
        onError: (err) => setServerError(errorMessage(err, 'Could not save production.')),
      },
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack spacing={3}>
          {serverError && <Alert severity="error">{serverError}</Alert>}
          {projects.isSuccess && projectOptions.length === 0 && (
            <Alert severity="warning">
              Your team has no active project yet, so new charts can&apos;t be entered. Ask your Manager to assign a project to your team.
            </Alert>
          )}

          <FormSection title="Coder (from your login)">
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Input label="Coder Name" value={user?.fullName ?? user?.loginName ?? ''} disabled />
              </Grid>
              <Grid item xs={12} md={4}>
                <Input label="Employee ID" value={user?.employeeId ?? ''} disabled />
              </Grid>
              <Grid item xs={12} md={4}>
                <Input label="Login Name" value={user?.loginName ?? ''} disabled />
              </Grid>
            </Grid>
          </FormSection>

          <FormSection title="Chart">
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Input label="Chart ID" error={!!errors.chartId} helperText={errors.chartId?.message} {...register('chartId')} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="projectId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      label="Project"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value || undefined)}
                      error={!!errors.projectId}
                      helperText={errors.projectId?.message ?? 'Required for a new Chart ID'}
                      options={[
                        { value: '', label: 'Select project' },
                        ...projectOptions.map((p) => ({ value: p.id, label: p.client ? `${p.name} (${p.client.name})` : p.name })),
                      ]}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </FormSection>

          <FormSection title="Production">
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Input label="Page Count" type="number" inputProps={{ min: 1 }} error={!!errors.pageCount} helperText={errors.pageCount?.message} {...register('pageCount', { valueAsNumber: true })} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Input label="Total ICDs" type="number" inputProps={{ min: 0 }} error={!!errors.totalICDs} helperText={errors.totalICDs?.message} {...register('totalICDs', { valueAsNumber: true })} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Input label="Total DOS" type="number" inputProps={{ min: 0 }} error={!!errors.totalDOS} helperText={errors.totalDOS?.message} {...register('totalDOS', { valueAsNumber: true })} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select
                      label="Status"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      error={!!errors.status}
                      helperText={errors.status?.message}
                      options={[
                        { value: 'PENDING', label: 'Pending' },
                        { value: 'IN_PROGRESS', label: 'In Progress' },
                        { value: 'COMPLETED', label: 'Completed' },
                      ]}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <DatePicker label="Coded Date" error={!!errors.codedDate} helperText={errors.codedDate?.message} {...asInputRef(register('codedDate'))} />
              </Grid>
              <Grid item xs={12}>
                <Input label="Remarks" multiline minRows={2} error={!!errors.remarks} helperText={errors.remarks?.message} {...register('remarks')} />
              </Grid>
            </Grid>
          </FormSection>

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button variant="text" onClick={() => router.push('/coder/production')}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving...' : 'Save Production'}
            </Button>
          </Stack>
        </Stack>
      </form>
    </Paper>
  );
}
