'use client';
import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Stack from '@mui/material/Stack';
import { UpdateTeamLeadSchema, type UpdateTeamLeadInput, type TeamLead } from '@smartcode/types';
import { Modal, Input, Select, Button, useToast } from '@smartcode/ui';
import { useUpdateTeamLead } from './use-team-leads';
import { useTeams } from './use-teams';

export function EditTeamLeadDialog({
  open,
  onClose,
  teamLead,
}: {
  open: boolean;
  onClose: () => void;
  teamLead: TeamLead | null;
}) {
  const { showToast } = useToast();
  const updateTeamLead = useUpdateTeamLead();
  const { data: teams } = useTeams();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<UpdateTeamLeadInput>({ resolver: zodResolver(UpdateTeamLeadSchema) });

  // Repopulate the form whenever a different Team Lead is opened for editing.
  React.useEffect(() => {
    if (teamLead) {
      reset({
        fullName: teamLead.fullName ?? '',
        email: teamLead.email,
        employeeId: teamLead.employeeId,
        teamId: teamLead.team?.id ?? null,
      });
    }
  }, [teamLead, reset]);

  const handleClose = () => {
    updateTeamLead.reset();
    onClose();
  };

  const onSubmit = (data: UpdateTeamLeadInput) => {
    if (!teamLead) return;
    updateTeamLead.mutate(
      { id: teamLead.id, input: data },
      {
        onSuccess: () => {
          showToast('Team Lead updated.', 'success');
          handleClose();
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : 'Could not update Team Lead.';
          showToast(message, 'error');
        },
      },
    );
  };

  // The team this Team Lead already leads is always offered (so the
  // dropdown reflects the current state), plus any other team not yet
  // led by someone else.
  const availableTeams = (teams ?? []).filter((t) => !t.teamLead || t.id === teamLead?.team?.id);

  if (!teamLead) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Edit ${teamLead.fullName ?? teamLead.loginName}`}
      maxWidth="sm"
      actions={
        <>
          <Button variant="text" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={updateTeamLead.isPending}>
            {updateTeamLead.isPending ? 'Saving...' : 'Save Changes'}
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
            label="Email"
            type="email"
            error={!!errors.email}
            helperText={errors.email?.message}
            {...register('email')}
          />
          <Controller
            name="teamId"
            control={control}
            render={({ field }) => (
              <Select
                label="Team"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                options={[
                  { value: '', label: 'No team assignment' },
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
