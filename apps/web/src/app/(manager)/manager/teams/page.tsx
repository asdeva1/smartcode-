'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Teams"
      description="Manage teams and Team Lead assignment."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Teams' }]}
    />
  );
}
