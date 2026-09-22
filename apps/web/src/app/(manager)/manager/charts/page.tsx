'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Charts"
      description="Organization-wide chart index."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Charts' }]}
    />
  );
}
