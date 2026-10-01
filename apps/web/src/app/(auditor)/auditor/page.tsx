'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { Search } from 'lucide-react';
import { ChartIdSchema } from '@smartcode/types';
import { Button, Input, PageHeader } from '@smartcode/ui';
import { DashboardMetrics } from '@/components/data/DashboardMetrics';
import { OrgContextBanner } from '@/components/data/OrgContextBanner';
import { WelcomeAndQuickActions } from '@/components/data/QuickActions';
import { ReworkPanel } from '@/features/rework/ReworkPanel';

export default function AuditorDashboardPage() {
  const router = useRouter();
  const [chartId, setChartId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = ChartIdSchema.safeParse(chartId);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    router.push(`/auditor/audit-entry?chartId=${encodeURIComponent(parsed.data)}`);
  };

  return (
    <>
      <PageHeader title="My Dashboard" description="Your audit overview" />
      <OrgContextBanner />
      <WelcomeAndQuickActions
        actions={[
          { label: 'Audit Queue', href: '/auditor/queue' },
          { label: 'Audit Entry', href: '/auditor/audit-entry' },
          { label: 'My Audits', href: '/auditor/audits' },
          { label: 'Rework', href: '/auditor/rework' },
          { label: 'Reports', href: '/auditor/reports' },
        ]}
      />
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <form onSubmit={go} noValidate>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Input
              label="Quick search by Chart ID"
              value={chartId}
              onChange={(e) => setChartId(e.target.value)}
              error={!!error}
              helperText={error ?? ' '}
              sx={{ maxWidth: 320 }}
            />
            <Button type="submit" startIcon={<Search size={16} />}>
              Open
            </Button>
          </Stack>
        </form>
      </Paper>
      <DashboardMetrics />
      <ReworkPanel role="AUDITOR" />
    </>
  );
}
