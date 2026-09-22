'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Coders"
      description="Manage Coder accounts on your team."
      breadcrumbItems={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Coders' }]}
    />
  );
}
