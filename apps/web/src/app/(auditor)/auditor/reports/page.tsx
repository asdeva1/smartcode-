'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Reports"
      description="Your own audit report."
      breadcrumbItems={[{ label: 'Dashboard', href: '/auditor' }, { label: 'Reports' }]}
    />
  );
}
