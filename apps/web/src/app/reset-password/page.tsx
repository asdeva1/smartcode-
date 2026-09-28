'use client';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import { CompletePasswordResetSchema, type CompletePasswordResetInput } from '@smartcode/types';
import { Alert, Button, Input, LoadingState } from '@smartcode/ui';
import { errorMessage } from '@/lib/format';
import { useCompletePasswordReset, useValidateResetToken } from '@/features/password-reset/use-complete-password-reset';

const INVALID_MESSAGES: Record<string, string> = {
  invalid: 'This reset link is invalid.',
  expired: 'This reset link has expired. Ask your Manager to approve a new request.',
  used: 'This reset link has already been used.',
  revoked: 'This reset link is no longer valid.',
};

/**
 * Public "set new password" page (docs/09-BUSINESS-RULES.md section 8,
 * Phase 8) - reached only via a single-use link a Manager generated and
 * sent out of band. Mirrors app/login/page.tsx's layout. Never reveals
 * whose account a token belongs to beyond whether it currently works.
 */
function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const validation = useValidateResetToken(token || undefined);
  const complete = useCompletePasswordReset();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompletePasswordResetInput>({
    resolver: zodResolver(CompletePasswordResetSchema),
    defaultValues: { token, newPassword: '', confirmNewPassword: '' },
  });

  const onSubmit = (data: CompletePasswordResetInput) => {
    complete.mutate({ token, newPassword: data.newPassword, confirmNewPassword: data.confirmNewPassword });
  };

  if (!token) {
    return <Alert severity="error">This reset link is missing its token. Ask your Manager to resend it.</Alert>;
  }

  if (validation.isLoading) {
    return <LoadingState />;
  }

  if (complete.isSuccess) {
    return (
      <Alert severity="success">
        Your password has been reset. Any previous sessions have been signed out - please sign in again with your new
        password.
      </Alert>
    );
  }

  if (validation.isError || (validation.data && !validation.data.valid)) {
    const reason = validation.data?.reason ?? 'invalid';
    return <Alert severity="error">{INVALID_MESSAGES[reason] ?? INVALID_MESSAGES.invalid}</Alert>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack spacing={2}>
        <Input
          label="New Password"
          type="password"
          autoComplete="new-password"
          error={!!errors.newPassword}
          helperText={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <Input
          label="Confirm New Password"
          type="password"
          autoComplete="new-password"
          error={!!errors.confirmNewPassword}
          helperText={errors.confirmNewPassword?.message}
          {...register('confirmNewPassword')}
        />
        {complete.isError && <Alert severity="error">{errorMessage(complete.error, 'Could not reset your password.')}</Alert>}
        <Button type="submit" fullWidth disabled={complete.isPending}>
          {complete.isPending ? 'Resetting...' : 'Reset Password'}
        </Button>
      </Stack>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
      }}
    >
      <Paper variant="outlined" sx={{ p: 4, width: '100%', maxWidth: 400 }}>
        <Stack spacing={0.5} alignItems="center" sx={{ mb: 3 }}>
          <img src="/smartclues-logo.png" alt="SmartClues Technologies" height={32} />
          <Typography variant="body2" color="text.secondary">
            Medical Coding Operations
          </Typography>
        </Stack>

        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
          Set a new password
        </Typography>

        <React.Suspense fallback={<LoadingState />}>
          <ResetPasswordForm />
        </React.Suspense>
      </Paper>
    </Box>
  );
}
