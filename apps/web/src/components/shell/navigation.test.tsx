import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NAVIGATION, ROLE_HOME } from '@smartcode/config';
import { ROLES, type AuthUser, type Role } from '@smartcode/types';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { apiFetch } from '@/lib/api-client';
import { callsTo, renderWithProviders, routeApi } from '@/test-utils/render';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/api-client', () => ({ ...jest.requireActual('@/lib/api-client'), apiFetch: jest.fn() }));

const fetchMock = apiFetch as jest.Mock;
const labels = (role: Role) => NAVIGATION[role].map((i) => i.label);
const user = (role: Role): AuthUser => ({ id: 'u', employeeId: 'EMP9', loginName: 'someone', email: 'u@x.local', fullName: 'Some One', role, teamId: null, isActive: true });

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
});

describe('Role-specific navigation (Phase 10)', () => {
  it('matches the required menu for every role, in order', () => {
    expect(labels('MANAGER')).toEqual(['Dashboard', 'Vendors', 'Team Leads', 'Auditors', 'Teams', 'Projects', 'Charts', 'Production', 'Audits', 'Reports', 'Activity Logs', 'Audit Logs', 'Approvals', 'Password Reset Requests', 'Settings']);
    expect(labels('VENDOR')).toEqual(['Dashboard', 'Team Leads', 'Auditors', 'Coders', 'Teams', 'Charts', 'Production', 'Audits', 'Rework', 'Reports']);
    expect(labels('TEAM_LEAD')).toEqual(['Dashboard', 'Team', 'Coders', 'Production', 'Charts', 'Audits', 'Rework', 'Reports', 'Productivity']);
    expect(labels('AUDITOR')).toEqual(['Dashboard', 'Audit Queue', 'Charts', 'Audits', 'Rework', 'Reports']);
    expect(labels('CODER')).toEqual(['Dashboard', 'Production', 'Charts', 'Rework', 'Reports']);
  });

  it('never exposes another role\'s area, Vendor management outside the Manager, or settings outside the Manager', () => {
    for (const role of ROLES) {
      const hrefs = NAVIGATION[role].map((i) => i.href);
      expect(hrefs.every((h) => h === ROLE_HOME[role] || h.startsWith(`${ROLE_HOME[role]}/`))).toBe(true);
      if (role !== 'MANAGER') expect(hrefs.some((h) => /vendors|settings/.test(h))).toBe(false);
    }
    expect(ROLE_HOME.VENDOR).toBe('/vendor');
  });

  it('renders the Vendor sidebar', () => {
    renderWithProviders(<Sidebar role="VENDOR" />);
    const nav = screen.getByRole('navigation');
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(NAVIGATION.VENDOR.map((i) => i.href));
  });
});

describe('Top bar', () => {
  const notifications = {
    unread: 1,
    data: [
      { id: 'n1', type: 'REWORK_REQUESTED', message: 'Chart CH-100 (version 1) was sent back for rework: ICD missing', entity: 'Rework', entityId: 'rw-1', isRead: false, readAt: null, createdAt: '2026-09-26T09:30:00Z' },
      { id: 'n2', type: 'REWORK_RESOLVED', message: 'Older, already read', entity: 'Rework', entityId: 'rw-0', isRead: true, readAt: '2026-09-20T09:30:00Z', createdAt: '2026-09-19T09:30:00Z' },
    ],
  };

  it('shows the unread count and opens the related rework, marking the notification read', async () => {
    routeApi(fetchMock, { 'GET /notifications': notifications, 'POST /notifications/n1/read': { id: 'n1', isRead: true } });
    const u = userEvent.setup();
    renderWithProviders(<TopNav user={user('TEAM_LEAD')} />);
    const bell = await screen.findByRole('button', { name: 'Notifications (1 unread)' });
    await u.click(bell);
    await u.click(await screen.findByText(/sent back for rework: ICD missing/));
    await waitFor(() => expect(callsTo(fetchMock, '/notifications/n1/read', 'POST')).toHaveLength(1));
    expect(push).toHaveBeenCalledWith('/team-lead/rework?open=rw-1');
  });

  it('offers Reset Password only to the Manager', async () => {
    routeApi(fetchMock, { 'GET /notifications': { unread: 0, data: [] } });
    const u = userEvent.setup();
    const { unmount } = renderWithProviders(<TopNav user={user('MANAGER')} />);
    await u.click(screen.getByText('someone'));
    expect(await screen.findByRole('menuitem', { name: 'Reset Password' })).toHaveAttribute('href', '/manager/settings');
    await u.keyboard('{Escape}');
    unmount();
    for (const role of ['TEAM_LEAD', 'AUDITOR', 'CODER', 'VENDOR'] as Role[]) {
      const r = renderWithProviders(<TopNav user={user(role)} />);
      await u.click(screen.getByText('someone'));
      expect(await screen.findByRole('menuitem', { name: 'Logout' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Reset Password' })).not.toBeInTheDocument();
      await u.keyboard('{Escape}');
      r.unmount();
    }
  });
});
