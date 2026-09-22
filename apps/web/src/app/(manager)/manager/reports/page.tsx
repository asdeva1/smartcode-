'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Reports"
      description="Production and audit reporting."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Reports' }]}
    />
  );
}
