'use client';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Stack from '@mui/material/Stack';
import { UpdateAuditorSchema, type UpdateAuditorInput, type Auditor } from '@smartcode/types';
import { Modal, Input, Button, useToast } from '@smartcode/ui';
import { useUpdateAuditor } from './use-auditors';

export function EditAuditorDialog({
  open,
  onClose,
  auditor,
}: {
  open: boolean;
  onClose: () => void;
  auditor: Auditor | null;
}) {
  const { showToast } = useToast();
  const updateAuditor = useUpdateAuditor();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateAuditorInput>({ resolver: zodResolver(UpdateAuditorSchema) });

  // Repopulate the form whenever a different Auditor is opened for editing.
  React.useEffect(() => {
    if (auditor) {
      reset({
        employeeId: auditor.employeeId,
        fullName: auditor.fullName ?? '',
        email: auditor.email,
      });
    }
  }, [auditor, reset]);

  const handleClose = () => {
    updateAuditor.reset();
    onClose();
  };

  const onSubmit = (data: UpdateAuditorInput) => {
    if (!auditor) return;
    updateAuditor.mutate(
      { id: auditor.id, input: data },
      {
        onSuccess: () => {
          showToast('Auditor updated.', 'success');
          handleClose();
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : 'Could not update Auditor.';
          showToast(message, 'error');
        },
      },
    );
  };

  if (!auditor) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Edit ${auditor.fullName ?? auditor.loginName}`}
      maxWidth="sm"
      actions={
        <>
          <Button variant="text" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={updateAuditor.isPending}>
            {updateAuditor.isPending ? 'Saving...' : 'Save Changes'}
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
          {/* Login name is shown for reference only - it is not editable. */}
          <Input label="Login Name" value={auditor.loginName} disabled />
        </Stack>
      </form>
    </Modal>
  );
}
