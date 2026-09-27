'use client';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Stack from '@mui/material/Stack';
import { UpdateCoderSchema, type Coder, type UpdateCoderInput } from '@smartcode/types';
import { Button, Input, Modal, useToast } from '@smartcode/ui';
import { errorMessage } from '@/lib/format';
import { useUpdateCoder } from './use-coders';

export function EditCoderDialog({ open, onClose, coder }: { open: boolean; onClose: () => void; coder: Coder | null }) {
  const { showToast } = useToast();
  const updateCoder = useUpdateCoder();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateCoderInput>({ resolver: zodResolver(UpdateCoderSchema) });

  React.useEffect(() => {
    if (coder) reset({ employeeId: coder.employeeId, fullName: coder.fullName ?? '', email: coder.email });
  }, [coder, reset]);

  const handleClose = () => {
    updateCoder.reset();
    onClose();
  };

  const onSubmit = (data: UpdateCoderInput) => {
    if (!coder) return;
    updateCoder.mutate(
      { id: coder.id, input: data },
      {
        onSuccess: () => {
          showToast('Coder updated.', 'success');
          handleClose();
        },
        onError: (err) => showToast(errorMessage(err, 'Could not update Coder.'), 'error'),
      },
    );
  };

  if (!coder) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Edit ${coder.fullName ?? coder.loginName}`}
      actions={
        <>
          <Button variant="text" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={updateCoder.isPending}>
            {updateCoder.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack spacing={2}>
          <Input label="Employee ID" error={!!errors.employeeId} helperText={errors.employeeId?.message} {...register('employeeId')} />
          <Input label="Full Name" error={!!errors.fullName} helperText={errors.fullName?.message} {...register('fullName')} />
          <Input label="Email" type="email" error={!!errors.email} helperText={errors.email?.message} {...register('email')} />
          <Input label="Login Name" value={coder.loginName} disabled />
        </Stack>
      </form>
    </Modal>
  );
}
