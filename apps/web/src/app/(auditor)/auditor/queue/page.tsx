'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Audit Queue"
      description="Charts ready for audit in your assigned projects."
      breadcrumbItems={[{ label: 'Dashboard', href: '/auditor' }, { label: 'Audit Queue' }]}
    />
  );
}
