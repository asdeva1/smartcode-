'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Charts"
      description="Charts belonging to your team's projects."
      breadcrumbItems={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Charts' }]}
    />
  );
}
