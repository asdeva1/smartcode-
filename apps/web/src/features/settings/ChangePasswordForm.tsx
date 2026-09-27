'use client';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import { ChangePasswordSchema, type ChangePasswordInput } from '@smartcode/types';
import { Alert, Button, FormSection, Input, useToast } from '@smartcode/ui';
import { apiFetch } from '@/lib/api-client';
import { errorMessage } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Manager changes their OWN login password. The backend (Manager-only
 * route + service check) verifies the current password, stores an argon2
 * hash, signs out every other session and returns a fresh token for this
 * one, which replaces the in-memory token here.
 */
export function ChangePasswordForm() {
  const { showToast } = useToast();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
  });
  const change = useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiFetch<{ accessToken: string; message: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: ({ accessToken }) => useAuthStore.setState({ accessToken }),
  });

  const onSubmit = (input: ChangePasswordInput) => {
    setServerError(null);
    setDone(false);
    change.mutate(input, {
      onSuccess: () => {
        reset();
        setDone(true);
        showToast('Password changed. Your other sessions have been signed out.', 'success');
      },
      onError: (err) => setServerError(errorMessage(err, 'Could not change your password.')),
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, maxWidth: 640 }}>
      <FormSection title="Reset Password" description="Change the password you use to sign in. Other devices and sessions will be signed out.">
        {serverError && <Alert severity="error">{serverError}</Alert>}
        {done && <Alert severity="success">Your password was changed.</Alert>}
        <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Reset password">
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Input
                label="Current Password"
                type="password"
                autoComplete="current-password"
                error={!!errors.currentPassword}
                helperText={errors.currentPassword?.message}
                {...register('currentPassword')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Input
                label="New Password"
                type="password"
                autoComplete="new-password"
                error={!!errors.newPassword}
                helperText={errors.newPassword?.message ?? 'At least 8 characters'}
                {...register('newPassword')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Input
                label="Confirm New Password"
                type="password"
                autoComplete="new-password"
                error={!!errors.confirmNewPassword}
                helperText={errors.confirmNewPassword?.message}
                {...register('confirmNewPassword')}
              />
            </Grid>
            <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" disabled={change.isPending}>
                {change.isPending ? 'Changing...' : 'Change Password'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </FormSection>
    </Paper>
  );
}
