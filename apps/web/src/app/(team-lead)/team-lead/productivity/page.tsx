'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Productivity"
      description="Charts Per Hour (CPH) for your team."
      breadcrumbItems={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Productivity' }]}
    />
  );
}
