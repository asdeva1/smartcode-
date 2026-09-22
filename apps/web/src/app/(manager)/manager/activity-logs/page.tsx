'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Activity Logs"
      description="Recent activity across the organization."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Activity Logs' }]}
    />
  );
}
