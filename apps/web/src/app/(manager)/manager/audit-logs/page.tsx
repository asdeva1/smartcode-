'use client';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Audit Logs"
      description="Compliance-grade audit log (append-only)."
      breadcrumbItems={[{ label: 'Manager', href: '/manager' }, { label: 'Audit Logs' }]}
    />
  );
}
