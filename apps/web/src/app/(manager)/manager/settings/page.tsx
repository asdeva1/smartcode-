'use client';
import * as React from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Breadcrumb, FormSection, PageHeader } from '@smartcode/ui';
import { useCurrentUser } from '@/features/auth/use-auth';
import { ChangePasswordForm } from '@/features/settings/ChangePasswordForm';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Grid item xs={12} sm={6}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Grid>
  );
}

export default function Page() {
  const { user } = useCurrentUser();
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile and password."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Settings' }]} />}
      />
      <Paper variant="outlined" sx={{ p: 2, mb: 2, maxWidth: 640 }}>
        <FormSection title="Profile" description="Your account details.">
          <Grid container spacing={2}>
            <Field label="Full Name" value={user?.fullName ?? '—'} />
            <Field label="Employee ID" value={user?.employeeId ?? '—'} />
            <Field label="Login Name" value={user?.loginName ?? '—'} />
            <Field label="Email" value={user?.email ?? '—'} />
          </Grid>
        </FormSection>
      </Paper>
      <ChangePasswordForm />
    </>
  );
}
