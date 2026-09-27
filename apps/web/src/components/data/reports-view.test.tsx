import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { REPORTS_BY_ROLE, resolvePeriod } from '@smartcode/types';
import { ReportsView } from './ReportsView';
import { apiDownload, apiFetch } from '@/lib/api-client';
import { todayLocal } from '@/lib/format';
import { callsTo, chooseOption, renderWithProviders, routeApi } from '@/test-utils/render';

jest.mock('@/lib/api-client', () => ({ ...jest.requireActual('@/lib/api-client'), apiFetch: jest.fn(), apiDownload: jest.fn() }));

const fetchMock = apiFetch as jest.Mock;
const downloadMock = apiDownload as jest.Mock;
const report = (path: string) => ({
  report: path.split('/')[2].split('?')[0], title: 'x', family: 'INTERNAL_PRODUCTION', familyTitle: 'Internal Production Report', ownerRole: 'TEAM_LEAD', access: 'owner',
  generatedAt: '', filters: { from: null, to: null },
  columns: [{ key: 'period', label: 'Period' }, { key: 'charts', label: 'Charts', numeric: true }],
  rows: [{ period: 'TOTAL', charts: 42 }],
});
const reportCalls = () => fetchMock.mock.calls.map(([p]) => String(p)).filter((p) => p.startsWith('/reports/'));

beforeEach(() => {
  fetchMock.mockReset();
  downloadMock.mockReset();
});

describe('Report period selector', () => {
  it('defaults to all time; a named period sends period + the local "today" and shows the resolved range', async () => {
    routeApi(fetchMock, { 'GET /reports/': report });
    const user = userEvent.setup();
    renderWithProviders(<ReportsView reports={REPORTS_BY_ROLE.TEAM_LEAD} role="TEAM_LEAD" />);
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(reportCalls()[0]).toBe('/reports/production-summary?');

    await chooseOption(user, 'Period', 'Last Month');
    const today = todayLocal();
    await waitFor(() => expect(reportCalls()).toContain(`/reports/production-summary?period=last_month&today=${today}`));
    const range = resolvePeriod('last_month', today);
    expect(screen.getByLabelText('From')).toHaveValue(range.from);
    expect(screen.getByLabelText('To')).toHaveValue(range.to);
    expect(screen.getByLabelText('From')).toBeDisabled();

    downloadMock.mockResolvedValue('r.csv');
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Export CSV' }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledWith(`/reports/production-summary/export?period=last_month&today=${today}&format=csv`));
    await screen.findByText('Downloaded r.csv');
  });

  it('offers every required period', async () => {
    routeApi(fetchMock, { 'GET /reports/': report });
    const user = userEvent.setup();
    renderWithProviders(<ReportsView reports={['production-summary']} role="MANAGER" />);
    await screen.findByText('42');
    await user.click(screen.getByRole('combobox', { name: 'Period' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All time', 'Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Last Month', 'This Quarter', 'Last Quarter', 'This Year', 'Custom Date Range']);
    await user.keyboard('{Escape}');
  });

  it('a custom range waits for both dates, then sends them', async () => {
    routeApi(fetchMock, { 'GET /reports/': report });
    const user = userEvent.setup();
    renderWithProviders(<ReportsView reports={['production-summary']} role="TEAM_LEAD" />);
    await screen.findByText('42');
    const before = reportCalls().length;
    await chooseOption(user, 'Period', 'Custom Date Range');
    expect(await screen.findByText('Choose both a From and a To date for a custom range.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('From'), '2026-02-01');
    expect(reportCalls()).toHaveLength(before);
    await user.type(screen.getByLabelText('To'), '2026-02-28');
    await waitFor(() => expect(reportCalls()).toContain(`/reports/production-summary?from=2026-02-01&to=2026-02-28&period=custom&today=${todayLocal()}`));
  });

  it('offers period grouping only for summary reports', async () => {
    routeApi(fetchMock, { 'GET /reports/': report });
    const user = userEvent.setup();
    renderWithProviders(<ReportsView reports={['production-summary', 'production-detail']} role="TEAM_LEAD" />);
    await screen.findByText('42');
    await chooseOption(user, 'Group by', 'Monthly');
    await waitFor(() => expect(reportCalls()).toContain('/reports/production-summary?groupBy=month'));
    await chooseOption(user, 'Report', 'Production Detail');
    await waitFor(() => expect(reportCalls()).toContain('/reports/production-detail?'));
    expect(screen.queryByRole('combobox', { name: 'Group by' })).not.toBeInTheDocument();
  });

  it('shows report ownership and only the filters each role may use', async () => {
    routeApi(fetchMock, { 'GET /reports/': report, 'GET /vendors/options': [{ id: 'v-1', name: 'Vendor Alpha', code: 'A', isActive: true }] });
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<ReportsView reports={REPORTS_BY_ROLE.MANAGER} role="MANAGER" />);
    await screen.findByText('42');
    expect(screen.getByText('Internal Production Report')).toBeInTheDocument();
    expect(screen.getByText('Owner: Team Lead')).toBeInTheDocument();
    for (const name of ['Vendor', 'Team Lead', 'Auditor', 'Team', 'Project']) expect(screen.getByRole('combobox', { name })).toBeInTheDocument();
    await chooseOption(user, 'Vendor', 'Vendor Alpha');
    await waitFor(() => expect(reportCalls()).toContain('/reports/production-summary?vendorId=v-1'));
    unmount();

    renderWithProviders(<ReportsView reports={REPORTS_BY_ROLE.TEAM_LEAD} role="TEAM_LEAD" />);
    await screen.findByText('42');
    expect(screen.getByText('Owner: Team Lead (you)')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Coder' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Vendor' })).not.toBeInTheDocument();
  });
});
