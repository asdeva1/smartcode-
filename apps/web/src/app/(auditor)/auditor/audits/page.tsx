'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="View Audits"
      description="Your completed and in-progress audits."
      breadcrumbItems={[{ label: 'Dashboard', href: '/auditor' }, { label: 'View Audits' }]}
    />
  );
}
