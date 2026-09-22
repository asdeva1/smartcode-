'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Production"
      description="All production entries across teams."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Production' }]}
    />
  );
}
