'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="My Production"
      description="View and edit your production entries."
      breadcrumbItems={[{ label: 'Dashboard', href: '/coder' }, { label: 'My Production' }]}
    />
  );
}
