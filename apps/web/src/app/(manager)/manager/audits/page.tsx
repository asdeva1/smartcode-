'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Audits"
      description="All audit entries across teams."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Audit' }]}
    />
  );
}
