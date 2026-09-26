'use client';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Stack from '@mui/material/Stack';
import { CreateAuditorSchema, type CreateAuditorInput } from '@smartcode/types';
import { Modal, Input, Button, useToast } from '@smartcode/ui';
import { useCreateAuditor } from './use-auditors';

export function CreateAuditorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const createAuditor = useCreateAuditor();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAuditorInput>({ resolver: zodResolver(CreateAuditorSchema) });

  const handleClose = () => {
    reset();
    createAuditor.reset();
    onClose();
  };

  const onSubmit = (data: CreateAuditorInput) => {
    createAuditor.mutate(data, {
      onSuccess: () => {
        showToast('Auditor account created.', 'success');
        handleClose();
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : 'Could not create Auditor.';
        showToast(message, 'error');
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create Auditor"
      maxWidth="sm"
      actions={
        <>
          <Button variant="text" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={createAuditor.isPending}>
            {createAuditor.isPending ? 'Creating...' : 'Create Auditor'}
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
        </Stack>
      </form>
    </Modal>
  );
}
