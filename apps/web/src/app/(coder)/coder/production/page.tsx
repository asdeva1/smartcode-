'use client';
import * as React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Breadcrumb, Button, PageHeader } from '@smartcode/ui';
import { ProductionTable } from '@/features/production/ProductionTable';

export default function Page() {
  return (
    <>
      <PageHeader
        title="My Production"
        description="Your production entries. Completed records are locked - send them to rework to correct them."
        breadcrumb={<Breadcrumb items={[{ label: 'Coder', href: '/coder' }, { label: 'My Production' }]} />}
        actions={
          <Button startIcon={<Plus size={16} />} component={Link} href="/coder/production/new">
            Add Production
          </Button>
        }
      />
      <ProductionTable role="CODER" />
    </>
  );
}
