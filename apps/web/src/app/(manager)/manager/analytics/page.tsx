'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Analytics"
      description="Organization-wide analytics."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Analytics' }]}
    />
  );
}
