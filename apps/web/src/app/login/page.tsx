'use client';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import { LoginSchema, type LoginInput } from '@smartcode/types';
import { ROLE_HOME } from '@smartcode/config';
import { Button, Input, Alert } from '@smartcode/ui';
import { useLogin } from '@/features/auth/use-auth';

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

  const onSubmit = (data: LoginInput) => {
    login.mutate(data, {
      onSuccess: ({ user }) => router.replace(ROLE_HOME[user.role]),
    });
  };

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
          Sign in
        </Typography>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Stack spacing={2}>
            <Input
              label="Login Name"
              autoComplete="username"
              error={!!errors.loginName}
              helperText={errors.loginName?.message}
              {...register('loginName')}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              error={!!errors.password}
              helperText={errors.password?.message}
              {...register('password')}
            />
            {login.isError && <Alert severity="error">Invalid login name or password.</Alert>}
            <Button type="submit" fullWidth disabled={login.isPending}>
              {login.isPending ? 'Signing in...' : 'Login'}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
