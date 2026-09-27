'use client';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Stack from '@mui/material/Stack';
import { CreateCoderSchema, type CreateCoderInput } from '@smartcode/types';
import { Button, Input, Modal, Select, useToast } from '@smartcode/ui';
import { errorMessage } from '@/lib/format';
import { useCreateCoder } from './use-coders';

/**
 * The new Coder joins the caller's own scope automatically - there is no
 * team/vendor field. basePath switches between the Team Lead's own-team
 * endpoint (default) and the Vendor Portal's own-vendor endpoint; either
 * way the scope is derived server-side from the session.
 */
export function CreateCoderDialog({ open, onClose, basePath }: { open: boolean; onClose: () => void; basePath?: string }) {
  const { showToast } = useToast();
  const createCoder = useCreateCoder(basePath);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateCoderInput>({ resolver: zodResolver(CreateCoderSchema), defaultValues: { isActive: true } });

  const handleClose = () => {
    reset();
    createCoder.reset();
    onClose();
  };

  const onSubmit = (data: CreateCoderInput) =>
    createCoder.mutate(data, {
      onSuccess: () => {
        showToast('Coder account created.', 'success');
        handleClose();
      },
      onError: (err) => showToast(errorMessage(err, 'Could not create Coder.'), 'error'),
    });

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create Coder"
      actions={
        <>
          <Button variant="text" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={createCoder.isPending}>
            {createCoder.isPending ? 'Creating...' : 'Create Coder'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack spacing={2}>
          <Input label="Employee ID" error={!!errors.employeeId} helperText={errors.employeeId?.message} {...register('employeeId')} />
          <Input label="Full Name" error={!!errors.fullName} helperText={errors.fullName?.message} {...register('fullName')} />
          <Input label="Login Name" error={!!errors.loginName} helperText={errors.loginName?.message} {...register('loginName')} />
          <Input label="Email" type="email" error={!!errors.email} helperText={errors.email?.message} {...register('email')} />
          <Input label="Password" type="password" error={!!errors.password} helperText={errors.password?.message} {...register('password')} />
          <Input
            label="Confirm Password"
            type="password"
            error={!!errors.confirmPassword}
            helperText={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Controller
            name="isActive"
            control={control}
            render={({ field }) => (
              <Select
                label="Status"
                value={field.value === false ? 'inactive' : 'active'}
                onChange={(e) => field.onChange(e.target.value === 'active')}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
            )}
          />
        </Stack>
      </form>
    </Modal>
  );
}
