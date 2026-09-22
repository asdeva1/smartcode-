import { RoleGuard } from '@/features/auth/RoleGuard';
import { AppShellWithUser } from '@/components/shell/AppShellWithUser';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard role="MANAGER">
      <AppShellWithUser>{children}</AppShellWithUser>
    </RoleGuard>
  );
}
