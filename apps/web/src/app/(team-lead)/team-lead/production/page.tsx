'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Production"
      description="Your team's production entries."
      breadcrumbItems={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Production' }]}
    />
  );
}
