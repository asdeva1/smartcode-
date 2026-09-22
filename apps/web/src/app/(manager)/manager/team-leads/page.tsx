'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Team Leads"
      description="Manage Team Lead accounts."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Team Leads' }]}
    />
  );
}
