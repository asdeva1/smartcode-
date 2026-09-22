'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="My Team"
      description="Team roster and status."
      breadcrumbItems={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'My Team' }]}
    />
  );
}
