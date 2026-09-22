'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Auditors"
      description="Manage Auditor accounts."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Auditors' }]}
    />
  );
}
