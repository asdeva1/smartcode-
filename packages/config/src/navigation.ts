import type { Role } from '@smartcode/types';

export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide-react icon name, resolved in apps/web
}

/**
 * Role-aware navigation — see brief Section 13 / docs/05-FRONTEND-ARCHITECTURE.md.
 * Single source of truth for the sidebar in apps/web so nav items
 * can't drift from the route structure. Only routes the role is
 * authorised for are listed; the backend enforces the same boundaries
 * independently. Some routes are reachable without a sidebar entry
 * (e.g. /coder/production/new and /auditor/audit-entry via dashboard
 * quick actions and the audit queue).
 */
export const NAVIGATION: Record<Role, NavItem[]> = {
  MANAGER: [
    { label: 'Dashboard', href: '/manager', icon: 'LayoutDashboard' },
    { label: 'Vendors', href: '/manager/vendors', icon: 'Building2' },
    { label: 'Team Leads', href: '/manager/team-leads', icon: 'UserCog' },
    { label: 'Auditors', href: '/manager/auditors', icon: 'ShieldCheck' },
    { label: 'Teams', href: '/manager/teams', icon: 'Network' },
    { label: 'Projects', href: '/manager/projects', icon: 'FolderKanban' },
    { label: 'Charts', href: '/manager/charts', icon: 'FileText' },
    { label: 'Production', href: '/manager/production', icon: 'ClipboardList' },
    { label: 'Audits', href: '/manager/audits', icon: 'ClipboardCheck' },
    { label: 'Reports', href: '/manager/reports', icon: 'BarChart3' },
    { label: 'Activity Logs', href: '/manager/activity-logs', icon: 'History' },
    { label: 'Audit Logs', href: '/manager/audit-logs', icon: 'ScrollText' },
    { label: 'Approvals', href: '/manager/approvals', icon: 'CheckSquare' },
    { label: 'Password Reset Requests', href: '/manager/password-reset-requests', icon: 'KeyRound' },
    { label: 'Settings', href: '/manager/settings', icon: 'Settings' },
  ],
  VENDOR: [
    { label: 'Dashboard', href: '/vendor', icon: 'LayoutDashboard' },
    { label: 'Team Leads', href: '/vendor/team-leads', icon: 'UserCog' },
    { label: 'Auditors', href: '/vendor/auditors', icon: 'ShieldCheck' },
    { label: 'Coders', href: '/vendor/coders', icon: 'Users' },
    { label: 'Teams', href: '/vendor/teams', icon: 'Network' },
    { label: 'Charts', href: '/vendor/charts', icon: 'FileText' },
    { label: 'Production', href: '/vendor/production', icon: 'ClipboardList' },
    { label: 'Audits', href: '/vendor/audits', icon: 'ClipboardCheck' },
    { label: 'Rework', href: '/vendor/rework', icon: 'RotateCcw' },
    { label: 'Reports', href: '/vendor/reports', icon: 'BarChart3' },
  ],
  TEAM_LEAD: [
    { label: 'Dashboard', href: '/team-lead', icon: 'LayoutDashboard' },
    { label: 'Team', href: '/team-lead/team', icon: 'Users' },
    { label: 'Coders', href: '/team-lead/coders', icon: 'UserCog' },
    { label: 'Production', href: '/team-lead/production', icon: 'ClipboardList' },
    { label: 'Charts', href: '/team-lead/charts', icon: 'FileText' },
    { label: 'Audits', href: '/team-lead/audits', icon: 'ClipboardCheck' },
    { label: 'Rework', href: '/team-lead/rework', icon: 'RotateCcw' },
    { label: 'Reports', href: '/team-lead/reports', icon: 'BarChart3' },
    { label: 'Productivity', href: '/team-lead/productivity', icon: 'Gauge' },
  ],
  AUDITOR: [
    { label: 'Dashboard', href: '/auditor', icon: 'LayoutDashboard' },
    { label: 'Audit Queue', href: '/auditor/queue', icon: 'ListChecks' },
    { label: 'Charts', href: '/auditor/charts', icon: 'FileText' },
    { label: 'Audits', href: '/auditor/audits', icon: 'ClipboardCheck' },
    { label: 'Rework', href: '/auditor/rework', icon: 'RotateCcw' },
    { label: 'Reports', href: '/auditor/reports', icon: 'BarChart3' },
  ],
  CODER: [
    { label: 'Dashboard', href: '/coder', icon: 'LayoutDashboard' },
    { label: 'Production', href: '/coder/production', icon: 'ClipboardList' },
    { label: 'Charts', href: '/coder/charts', icon: 'FileText' },
    { label: 'Rework', href: '/coder/rework', icon: 'RotateCcw' },
    { label: 'Reports', href: '/coder/reports', icon: 'BarChart3' },
  ],
};

/** The landing route each role is sent to immediately after login. */
export const ROLE_HOME: Record<Role, string> = {
  MANAGER: '/manager',
  TEAM_LEAD: '/team-lead',
  CODER: '/coder',
  AUDITOR: '/auditor',
  VENDOR: '/vendor',
};
