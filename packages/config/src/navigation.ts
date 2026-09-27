import type { Role } from '@smartcode/types';

export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide-react icon name, resolved in apps/web
}

/**
 * Role-aware navigation — see brief Section 13 / docs/05-FRONTEND-ARCHITECTURE.md.
 * Single source of truth for the sidebar in apps/web so nav items
 * can't drift from the route structure.
 */
export const NAVIGATION: Record<Role, NavItem[]> = {
  MANAGER: [
    { label: 'Dashboard', href: '/manager', icon: 'LayoutDashboard' },
    { label: 'Team Leads', href: '/manager/team-leads', icon: 'UserCog' },
    { label: 'Auditors', href: '/manager/auditors', icon: 'ShieldCheck' },
    { label: 'Coders', href: '/manager/coders', icon: 'Users' },
    { label: 'Teams', href: '/manager/teams', icon: 'Network' },
    { label: 'Charts', href: '/manager/charts', icon: 'FileText' },
    { label: 'Production', href: '/manager/production', icon: 'ClipboardList' },
    { label: 'Audit', href: '/manager/audits', icon: 'ClipboardCheck' },
    { label: 'Reports', href: '/manager/reports', icon: 'BarChart3' },
    { label: 'Analytics', href: '/manager/analytics', icon: 'LineChart' },
    { label: 'Activity Logs', href: '/manager/activity-logs', icon: 'History' },
    { label: 'Audit Logs', href: '/manager/audit-logs', icon: 'ScrollText' },
    { label: 'Settings', href: '/manager/settings', icon: 'Settings' },
  ],
  TEAM_LEAD: [
    { label: 'Dashboard', href: '/team-lead', icon: 'LayoutDashboard' },
    { label: 'My Team', href: '/team-lead/team', icon: 'Users' },
    { label: 'Coders', href: '/team-lead/coders', icon: 'UserCog' },
    { label: 'Production', href: '/team-lead/production', icon: 'ClipboardList' },
    { label: 'Audits', href: '/team-lead/audits', icon: 'ClipboardCheck' },
    { label: 'Charts', href: '/team-lead/charts', icon: 'FileText' },
    { label: 'Productivity', href: '/team-lead/productivity', icon: 'Gauge' },
    { label: 'Reports', href: '/team-lead/reports', icon: 'BarChart3' },
  ],
  CODER: [
    { label: 'Dashboard', href: '/coder', icon: 'LayoutDashboard' },
    { label: 'My Production', href: '/coder/production', icon: 'ClipboardList' },
    { label: 'Add Production', href: '/coder/production/new', icon: 'FilePlus' },
    { label: 'My Charts', href: '/coder/charts', icon: 'FileText' },
    { label: 'Reports', href: '/coder/reports', icon: 'BarChart3' },
  ],
  AUDITOR: [
    { label: 'Dashboard', href: '/auditor', icon: 'LayoutDashboard' },
    { label: 'Audit Queue', href: '/auditor/queue', icon: 'ListChecks' },
    { label: 'Audit Entry', href: '/auditor/audit-entry', icon: 'FilePlus' },
    { label: 'View Audits', href: '/auditor/audits', icon: 'ClipboardCheck' },
    { label: 'Charts', href: '/auditor/charts', icon: 'FileText' },
    { label: 'Reports', href: '/auditor/reports', icon: 'BarChart3' },
  ],
};

/** The landing route each role is sent to immediately after login. */
export const ROLE_HOME: Record<Role, string> = {
  MANAGER: '/manager',
  TEAM_LEAD: '/team-lead',
  CODER: '/coder',
  AUDITOR: '/auditor',
};
