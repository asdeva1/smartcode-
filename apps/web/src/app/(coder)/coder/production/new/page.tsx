'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Add Production"
      description="Submit a new production entry against a Chart ID."
      breadcrumbItems={[{ label: 'Dashboard', href: '/coder' }, { label: 'My Production', href: '/coder/production' }, { label: 'Add Production' }]}
    />
  );
}
