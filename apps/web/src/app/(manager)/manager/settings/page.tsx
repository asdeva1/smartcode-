'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Organization settings."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Settings' }]}
    />
  );
}
