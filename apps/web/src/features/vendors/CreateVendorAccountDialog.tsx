'use client';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Grid from '@mui/material/Grid';
import { CreateVendorAccountSchema, type CreateVendorAccountInput } from '@smartcode/types';
import { Alert, Button, Input, Modal, useToast } from '@smartcode/ui';
import { errorMessage } from '@/lib/format';
import { useCreateVendorAccount } from './use-vendors';

/** A Vendor login (role VENDOR) that sees only this vendor's data. */
export function CreateVendorAccountDialog({ vendorId, vendorName, onClose }: { vendorId: string; vendorName: string; onClose: () => void }) {
  const { showToast } = useToast();
  const create = useCreateVendorAccount();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateVendorAccountInput>({ resolver: zodResolver(CreateVendorAccountSchema) });

  const onSubmit = (input: CreateVendorAccountInput) => {
    setServerError(null);
    create.mutate(
      { vendorId, input },
      {
        onSuccess: () => {
          showToast(`Vendor account ${input.loginName} created.`, 'success');
          onClose();
        },
        onError: (err) => setServerError(errorMessage(err, 'Could not create the account.')),
      },
    );
  };

  const field = (name: keyof CreateVendorAccountInput, label: string, type = 'text') => (
    <Input label={label} type={type} error={!!errors[name]} helperText={errors[name]?.message} {...register(name)} />
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Create vendor account - ${vendorName}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create Account'}
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
          <Grid item xs={12} sm={6}>{field('fullName', 'Full Name')}</Grid>
          <Grid item xs={12} sm={6}>{field('employeeId', 'Employee ID')}</Grid>
          <Grid item xs={12} sm={6}>{field('loginName', 'Login Name')}</Grid>
          <Grid item xs={12} sm={6}>{field('email', 'Email')}</Grid>
          <Grid item xs={12} sm={6}>{field('password', 'Password', 'password')}</Grid>
          <Grid item xs={12} sm={6}>{field('confirmPassword', 'Confirm Password', 'password')}</Grid>
        </Grid>
      </form>
    </Modal>
  );
}
