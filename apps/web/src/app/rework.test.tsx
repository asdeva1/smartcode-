import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamLeadDashboard from './(team-lead)/team-lead/page';
import CoderDashboard from './(coder)/coder/page';
import CoderReworkPage from './(coder)/coder/rework/page';
import AuditorReworkPage from './(auditor)/auditor/rework/page';
import AuditEntryPage from './(auditor)/auditor/audit-entry/page';
import AuditorQueuePage from './(auditor)/auditor/queue/page';
import { apiFetch } from '@/lib/api-client';
import { callsTo, expectNoProhibitedField, page, renderWithProviders, routeApi } from '@/test-utils/render';

let searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => searchParams,
}));
jest.mock('@/lib/api-client', () => ({ ...jest.requireActual('@/lib/api-client'), apiFetch: jest.fn(), apiDownload: jest.fn() }));
jest.mock('@/features/auth/use-auth', () => ({
  useCurrentUser: () => ({
    user: { id: 'u-1', employeeId: 'EMP1', loginName: 'me', fullName: 'Me Myself', role: 'CODER', teamId: 't', isActive: true, email: 'm@x.local' },
    isLoading: false,
    isError: false,
  }),
}));

const fetchMock = apiFetch as jest.Mock;
const person = (id: string, name: string) => ({ id, fullName: name, employeeId: `E-${id}`, loginName: `${id}.login` });
const rework = (over: Record<string, unknown> = {}) => ({
  id: 'rw-1', chartId: 'CH-100', status: 'OPEN', reason: 'ICD missing for DOS 2', resolutionNote: null,
  createdAt: '2026-09-26T09:30:00.000Z', updatedAt: '2026-09-26T09:30:00.000Z', resolvedAt: null, reauditedAt: null,
  coder: person('c-1', 'Cody Coder'), auditor: person('a-1', 'Ava Auditor'), teamLead: person('tl-1', 'Tara Lead'), resolvedBy: null,
  team: { id: 't', name: 'Team One' }, project: { id: 'p', name: 'Cardio', client: null },
  audit: { id: 'au-1', status: 'REJECTED', auditDate: '2026-09-26', totalErrors: 3 },
  originalProduction: { id: 'p-1', version: 1, pageCount: 10, totalICDs: 4, totalDOS: 2, codedDate: '2026-09-25', remarks: null },
  reworkProduction: null,
  unread: true,
  ...over,
});
const summary = (over: Record<string, unknown> = {}) => ({ open: 1, inProgress: 1, resolved: 1, reaudited: 4, unread: 1, recent: [rework()], ...over });
const dash = { 'GET /reports/dashboard': { role: 'TEAM_LEAD', metrics: [{ key: 'charts', label: 'Team Charts', value: 9 }] } };

beforeEach(() => {
  fetchMock.mockReset();
  searchParams = new URLSearchParams();
});

describe('Rework notification on dashboards', () => {
  it('Team Lead dashboard shows count, unread indicator, chart, coder, reason, date/time, status and a link to the item', async () => {
    routeApi(fetchMock, { ...dash, 'GET /rework/summary': summary() });
    renderWithProviders(<TeamLeadDashboard />);
    const panel = await screen.findByRole('region', { name: 'Rework' });
    expect(await within(panel).findByText('CH-100')).toBeInTheDocument();
    expect(within(panel).getByText('2 pending')).toBeInTheDocument();
    expect(within(panel).getByText('1 awaiting re-audit')).toBeInTheDocument();
    expect(within(panel).getByText('1 new')).toBeInTheDocument();
    expect(within(panel).getByLabelText('1 unread rework notifications')).toBeInTheDocument();
    expect(within(panel).getByText('Cody Coder')).toBeInTheDocument();
    expect(within(panel).getByText('ICD missing for DOS 2')).toBeInTheDocument();
    expect(within(panel).getByText(new Date('2026-09-26T09:30:00.000Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))).toBeInTheDocument();
    const row = within(panel).getByText('CH-100').closest('tr')!;
    expect([...row.querySelectorAll('.MuiChip-label')].map((c) => c.textContent)).toEqual(['New', 'Open']); // unread + status
    expect(within(panel).getByRole('link', { name: 'Open rework for CH-100' })).toHaveAttribute('href', '/team-lead/rework?open=rw-1');
    expect(within(panel).getByRole('link', { name: 'View all rework' })).toHaveAttribute('href', '/team-lead/rework');
    expectNoProhibitedField();
  });

  it('dashboard refreshes only read the summary - they never create notifications', async () => {
    routeApi(fetchMock, { ...dash, 'GET /rework/summary': summary() });
    renderWithProviders(<TeamLeadDashboard />);
    await screen.findByText('ICD missing for DOS 2');
    const writes = fetchMock.mock.calls.filter(([, o]) => (o?.method ?? 'GET') !== 'GET');
    expect(writes).toEqual([]);
  });

  it('Coder dashboard shows the pending rework indicator and an action to open and resolve it', async () => {
    routeApi(fetchMock, { ...dash, 'GET /rework/summary': summary({ inProgress: 0, resolved: 0 }) });
    renderWithProviders(<CoderDashboard />);
    const panel = await screen.findByRole('region', { name: 'Rework' });
    expect(await within(panel).findByText('1 pending')).toBeInTheDocument();
    expect(within(panel).queryByText('Cody Coder')).not.toBeInTheDocument(); // coder column hidden for the coder
    expect(within(panel).getByRole('link', { name: 'Open rework for CH-100' })).toHaveAttribute('href', '/coder/rework?open=rw-1');
    expect(within(panel).getByText('Open & resolve')).toBeInTheDocument();
  });

  it('shows an empty state when there is no rework', async () => {
    routeApi(fetchMock, { ...dash, 'GET /rework/summary': summary({ open: 0, inProgress: 0, resolved: 0, unread: 0, recent: [] }) });
    renderWithProviders(<CoderDashboard />);
    expect(await screen.findByText('No rework')).toBeInTheDocument();
    expect(screen.getByText('0 pending')).toBeInTheDocument();
  });
});

describe('Coder - rework resolution', () => {
  it('opening an unread item from a notification marks it read', async () => {
    searchParams = new URLSearchParams('open=rw-1');
    routeApi(fetchMock, { 'GET /rework?': page([rework()]), 'GET /rework/rw-1': rework(), 'POST /rework/rw-1/read': { id: 'rw-1', markedRead: 1 } });
    renderWithProviders(<CoderReworkPage />);
    const drawer = await screen.findByRole('presentation');
    expect(await within(drawer).findByText(/ICD missing for DOS 2/)).toBeInTheDocument();
    await waitFor(() => expect(callsTo(fetchMock, '/rework/rw-1/read', 'POST')).toHaveLength(1));
  });

  it('resolves with corrected values and what was fixed; never sends identity', async () => {
    routeApi(fetchMock, {
      'GET /rework?': page([rework({ unread: false }), rework({ id: 'rw-2', chartId: 'CH-200', status: 'RESOLVED', unread: false })]),
      'POST /rework/rw-1/resolve': rework({ status: 'RESOLVED' }),
    });
    const user = userEvent.setup();
    renderWithProviders(<CoderReworkPage />);
    expect(await screen.findByText('CH-200')).toBeInTheDocument();
    // only open / in-progress items can be resolved
    expect(screen.queryByRole('button', { name: 'Resolve rework for CH-200' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resolve rework for CH-100' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Rework reason from Ava Auditor: ICD missing for DOS 2/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Total ICDs')).toHaveValue(4);

    await user.click(within(dialog).getByRole('button', { name: 'Submit correction' }));
    expect(await within(dialog).findByText('Describe what was corrected (at least 3 characters)')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/rework/rw-1/resolve', 'POST')).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText('Total ICDs'));
    await user.type(within(dialog).getByLabelText('Total ICDs'), '5');
    await user.type(within(dialog).getByLabelText('What was corrected'), 'Added the missing ICD');
    await user.click(within(dialog).getByRole('button', { name: 'Submit correction' }));
    await waitFor(() => expect(callsTo(fetchMock, '/rework/rw-1/resolve', 'POST')).toHaveLength(1));
    const body = JSON.parse(callsTo(fetchMock, '/rework/rw-1/resolve', 'POST')[0][1].body);
    expect(body).toEqual({ pageCount: 10, totalICDs: 5, totalDOS: 2, codedDate: '2026-09-25', resolutionNote: 'Added the missing ICD' });
    for (const k of ['coderId', 'employeeId', 'loginName']) expect(body).not.toHaveProperty(k);
    expect(await screen.findByText('Rework for chart CH-100 resolved - sent for re-audit.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the backend reason when the resolution is refused', async () => {
    routeApi(fetchMock, {
      'GET /rework?': page([rework({ unread: false })]),
      'POST /rework/rw-1/resolve': () => {
        throw new Error('The audited version is no longer current - refresh and try again');
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<CoderReworkPage />);
    await user.click(await screen.findByRole('button', { name: 'Resolve rework for CH-100' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('What was corrected'), 'Fixed it');
    await user.click(within(dialog).getByRole('button', { name: 'Submit correction' }));
    expect(await within(dialog).findByText(/no longer current/)).toBeInTheDocument();
  });
});

describe('Auditor - rework decisions and re-audit readiness', () => {
  const lookup = {
    chartId: 'CH-100', project: { id: 'p', name: 'Cardio', client: null },
    production: { id: 'p-1', version: 1, pageCount: 10, totalDOS: 2, totalICDs: 4, codedDate: '2026-09-25', status: 'COMPLETED', coder: person('c-1', 'Cody Coder') },
    audits: [], canAudit: true, reason: null, openAuditId: null, reauditTargetId: null, rework: null,
  };

  it('"Rework" cannot be recorded without a reason', async () => {
    searchParams = new URLSearchParams('chartId=CH-100');
    routeApi(fetchMock, { 'GET /charts/CH-100/production': lookup });
    const user = userEvent.setup();
    renderWithProviders(<AuditEntryPage />);
    await user.click(await screen.findByRole('button', { name: 'Rework' }));
    expect(await screen.findByText('Enter the rework reason in Remarks (at least 3 characters)')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/audits', 'POST')).toHaveLength(0);
  });

  it('flags a corrected version when auditing it', async () => {
    searchParams = new URLSearchParams('chartId=CH-100');
    routeApi(fetchMock, {
      'GET /charts/CH-100/production': { ...lookup, production: { ...lookup.production, version: 2 }, rework: { id: 'rw-1', status: 'RESOLVED', reason: 'ICD missing', resolutionNote: 'Added it' } },
    });
    renderWithProviders(<AuditEntryPage />);
    expect(await screen.findByText(/correction of an earlier rework/)).toBeInTheDocument();
    expect(screen.getByText('ICD missing')).toBeInTheDocument();
  });

  it('queue marks charts whose rework is resolved; the rework page lists them ready for re-audit', async () => {
    routeApi(fetchMock, {
      'GET /projects/mine': [],
      'GET /auditor/queue?': page([
        {
          chartId: 'CH-100', project: null, version: 2, pageCount: 10, totalDOS: 2, totalICDs: 5, codedDate: '2026-09-25', productionStatus: 'COMPLETED',
          coder: person('c-1', 'Cody Coder'), queueState: 'PENDING_AUDIT', myAuditId: null, isReaudit: true, rework: { id: 'rw-1', status: 'RESOLVED', reason: 'ICD missing' },
        },
      ]),
    });
    const { unmount } = renderWithProviders(<AuditorQueuePage />);
    expect(await screen.findByText('Rework resolved')).toBeInTheDocument();
    unmount();

    routeApi(fetchMock, { 'GET /rework?': page([rework({ status: 'RESOLVED', resolutionNote: 'Added it', unread: false })]), 'GET /rework/rw-1': rework({ status: 'RESOLVED', unread: false }) });
    const user = userEvent.setup();
    renderWithProviders(<AuditorReworkPage />);
    expect(await screen.findByText('CH-100')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/rework?page=1&pageSize=25&status=RESOLVED')).toHaveLength(1); // defaults to "ready for re-audit"
    await user.click(screen.getByRole('button', { name: 'View rework for CH-100' }));
    const drawer = await screen.findByRole('presentation');
    expect(await within(drawer).findByRole('link', { name: 'Re-audit' })).toHaveAttribute('href', '/auditor/audit-entry?chartId=CH-100');
    expect(callsTo(fetchMock, '/rework/rw-1/read', 'POST')).toHaveLength(0); // nothing unread -> no write
  });
});
