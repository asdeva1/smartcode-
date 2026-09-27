import { RoleGuard } from '@/features/auth/RoleGuard';
import { AppShellWithUser } from '@/components/shell/AppShellWithUser';

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard role="VENDOR">
      <AppShellWithUser>{children}</AppShellWithUser>
    </RoleGuard>
  );
}
