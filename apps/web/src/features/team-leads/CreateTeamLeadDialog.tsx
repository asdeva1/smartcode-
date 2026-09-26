'use client';
import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Stack from '@mui/material/Stack';
import { CreateTeamLeadSchema, type CreateTeamLeadInput } from '@smartcode/types';
import { Modal, Input, Select, Button, useToast } from '@smartcode/ui';
import { useCreateTeamLead } from './use-team-leads';
import { useTeams } from './use-teams';

export function CreateTeamLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const createTeamLead = useCreateTeamLead();
  const { data: teams } = useTeams();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateTeamLeadInput>({
    resolver: zodResolver(CreateTeamLeadSchema),
    defaultValues: { teamId: null },
  });

  const handleClose = () => {
    reset();
    createTeamLead.reset();
    onClose();
  };

  const onSubmit = (data: CreateTeamLeadInput) => {
    createTeamLead.mutate(data, {
      onSuccess: () => {
        showToast('Team Lead account created.', 'success');
        handleClose();
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : 'Could not create Team Lead.';
        showToast(message, 'error');
      },
    });
  };

  // Teams without a Team Lead already assigned - a team already led by
  // someone else isn't offered here (the backend also enforces this;
  // this is just the UI not offering a choice that would be rejected).
  const availableTeams = (teams ?? []).filter((t) => !t.teamLead);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create Team Lead"
      maxWidth="sm"
      actions={
        <>
          <Button variant="text" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={createTeamLead.isPending}>
            {createTeamLead.isPending ? 'Creating...' : 'Create Team Lead'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack spacing={2}>
          <Input
            label="Employee ID"
            error={!!errors.employeeId}
            helperText={errors.employeeId?.message}
            {...register('employeeId')}
          />
          <Input
            label="Full Name"
            error={!!errors.fullName}
            helperText={errors.fullName?.message}
            {...register('fullName')}
          />
          <Input
            label="Login Name"
            error={!!errors.loginName}
            helperText={errors.loginName?.message}
            {...register('loginName')}
          />
          <Input
            label="Email"
            type="email"
            error={!!errors.email}
            helperText={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Password"
            type="password"
            error={!!errors.password}
            helperText={errors.password?.message}
            {...register('password')}
          />
          <Input
            label="Confirm Password"
            type="password"
            error={!!errors.confirmPassword}
            helperText={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Controller
            name="teamId"
            control={control}
            render={({ field }) => (
              <Select
                label="Team (optional)"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                options={[
                  { value: '', label: 'No team assignment yet' },
                  ...availableTeams.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            )}
          />
        </Stack>
      </form>
    </Modal>
  );
}
