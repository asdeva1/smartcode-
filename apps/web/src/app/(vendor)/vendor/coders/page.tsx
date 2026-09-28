'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { CodersManager } from '@/features/coders/CodersManager';

/**
 * Vendor Portal Coder management - docs/09-BUSINESS-RULES.md "Coder
 * Creation From Vendor Portal". Reuses the same manager the Team Lead
 * screen uses, pointed at the Vendor's own-scope endpoint; the backend
 * derives the vendor from the session, never from anything sent here.
 */
export default function Page() {
  return (
    <CodersManager
      basePath="/vendor/coders"
      showImportExport={false}
      allowLoginNameRequest={false}
      headerActions={(actions) => (
        <PageHeader
          title="Coders"
          description="Coder accounts belonging to your vendor. New Coders automatically join whichever Team Lead your Manager has assigned you."
          breadcrumb={<Breadcrumb items={[{ label: 'Vendor', href: '/vendor' }, { label: 'Coders' }]} />}
          actions={actions}
        />
      )}
    />
  );
}
