'use client';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { AUDIT_IMPORT_HEADERS } from '@smartcode/types';
import { Breadcrumb, Button, PageHeader } from '@smartcode/ui';
import { useCurrentUser } from '@/features/auth/use-auth';
import { AuditsTable } from '@/features/audits/AuditsTable';
import { CsvImportDialog } from '@/components/data/CsvImportDialog';

export default function Page() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = React.useState(false);
  return (
    <>
      <PageHeader
        title="View Audits"
        description="Your audit records. Completed audits are final; rejected audits can be re-audited."
        breadcrumb={<Breadcrumb items={[{ label: 'Auditor', href: '/auditor' }, { label: 'View Audits' }]} />}
        actions={
          <Button variant="outlined" startIcon={<Upload size={16} />} onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
        }
      />
      <AuditsTable role="AUDITOR" userId={user?.id} />
      <CsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Audits"
        previewPath="/audits/import/preview"
        commitPath="/audits/import"
        headers={AUDIT_IMPORT_HEADERS}
        columns={['chartId', 'auditErrors', 'errorExceptions', 'status', 'auditDate', 'remarks']}
        templateRow={['CH-10001', '2', '1', 'COMPLETED', '2026-01-15', '']}
        onImported={() => {
          for (const key of ['audits', 'charts', 'dashboard']) queryClient.invalidateQueries({ queryKey: [key] });
        }}
      />
    </>
  );
}
