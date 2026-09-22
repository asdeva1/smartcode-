'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Reports"
      description="Team-scoped production and audit reports."
      breadcrumbItems={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Reports' }]}
    />
  );
}
