'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Reports"
      description="Your own production report."
      breadcrumbItems={[{ label: 'Dashboard', href: '/coder' }, { label: 'Reports' }]}
    />
  );
}
