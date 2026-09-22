'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Coders"
      description="View all Coder accounts across teams."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Coders' }]}
    />
  );
}
