import { RoleGuard } from '@/features/auth/RoleGuard';
import { AppShellWithUser } from '@/components/shell/AppShellWithUser';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard role="TEAM_LEAD">
      <AppShellWithUser>{children}</AppShellWithUser>
    </RoleGuard>
  );
}
