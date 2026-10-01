import { Test } from '@nestjs/testing';
import type { AuthUser } from '@smartcode/types';
import { OrgContextService } from './org-context.service';
import { PrismaService } from '../../prisma/prisma.service';

const manager: AuthUser = { id: 'm', employeeId: 'E', loginName: 'm', email: 'm@x.local', role: 'MANAGER', teamId: null, vendorId: null, isActive: true };
const coder: AuthUser = { id: 'c', employeeId: 'E2', loginName: 'c', email: 'c@x.local', role: 'CODER', teamId: 'team-1', vendorId: 'v-1', isActive: true };
const teamLead: AuthUser = { id: 'tl', employeeId: 'E3', loginName: 'tl', email: 'tl@x.local', role: 'TEAM_LEAD', teamId: 'team-1', vendorId: null, isActive: true };
const auditor: AuthUser = { id: 'au', employeeId: 'E4', loginName: 'au', email: 'au@x.local', role: 'AUDITOR', teamId: null, vendorId: null, isActive: true };
const vendorUser: AuthUser = { id: 'v', employeeId: 'E5', loginName: 'v', email: 'v@x.local', role: 'VENDOR', teamId: null, vendorId: 'v-1', isActive: true };

/**
 * Organization Assignment + Auto-Visibility requirement - the backend is
 * the single source of truth for "what is my current authorized
 * organizational context" (GET /me/context). These tests pin down the
 * per-role response shape without duplicating a real Prisma database -
 * see coders.service.spec.ts / projects.service.spec.ts for the same
 * hand-rolled prisma mock pattern.
 */
describe('OrgContextService', () => {
  let service: OrgContextService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          vendor: { id: 'v-1', name: 'Acme Vendor' },
          team: { id: 'team-1', name: 'Team Alpha', teamLead: { id: 'tl', fullName: 'Tara Lead', loginName: 'tl' } },
          leadsTeam: null,
          vendorAssignments: [],
          auditorAssignments: [],
          role: coder.role,
        }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      team: { findMany: jest.fn().mockResolvedValue([{ id: 'team-1', name: 'Team Alpha' }]) },
      project: { findMany: jest.fn().mockResolvedValue([{ id: 'p-1', name: 'Project Centauri', allocationType: 'AUTOMATIC', client: { id: 'cl-1', name: 'Client X' } }]) },
      vendor: { findUnique: jest.fn().mockResolvedValue({ id: 'v-1', name: 'Acme Vendor', code: 'ACME', isActive: true }) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [OrgContextService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(OrgContextService);
  });

  it('returns enterprise scope for a Manager, with no per-project data fetched', async () => {
    const result = await service.me(manager);
    expect(result).toEqual({ role: 'MANAGER', scope: 'ENTERPRISE' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('resolves a Coder\'s Vendor/Team/Team Lead/Project(s) from the same org-ref primitives Employee Directory uses', async () => {
    const result: any = await service.me(coder);
    expect(result.role).toBe('CODER');
    expect(result.vendor).toEqual({ id: 'v-1', name: 'Acme Vendor' });
    expect(result.team).toEqual({ id: 'team-1', name: 'Team Alpha', teamLead: { id: 'tl', fullName: 'Tara Lead', loginName: 'tl' } });
    expect(result.teamLead).toEqual({ id: 'tl', fullName: 'Tara Lead', loginName: 'tl' });
    expect(result.projects).toEqual([{ id: 'p-1', name: 'Project Centauri', allocationType: 'AUTOMATIC', client: { id: 'cl-1', name: 'Client X' } }]);
    // Scoped to the Coder's own team, never an arbitrary/manually-selected project (requirement section 12).
    expect(prisma.project.findMany.mock.calls[0][0].where).toMatchObject({ teamId: 'team-1' });
  });

  it('a Coder with no team gets an empty project list, never a fake/default project', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ vendor: null, team: null, leadsTeam: null, vendorAssignments: [], auditorAssignments: [], role: 'CODER' });
    const noTeamCoder = { ...coder, teamId: null };
    const result: any = await service.me(noTeamCoder);
    expect(result.team).toBeNull();
    expect(prisma.project.findMany.mock.calls[0][0].where).toMatchObject({ teamId: '__none__' });
  });

  it('includes Team Lead-specific fields (coderCount, teamMembers)', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ vendor: null, team: null, leadsTeam: { id: 'team-1', name: 'Team Alpha', teamLead: { id: 'tl', fullName: 'Tara Lead', loginName: 'tl' } }, vendorAssignments: [], auditorAssignments: [], role: 'TEAM_LEAD' });
    prisma.user.count.mockResolvedValueOnce(3);
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'c-1', fullName: 'Cody', loginName: 'cody', employeeId: 'EMP1' }]);
    const result: any = await service.me(teamLead);
    expect(result.role).toBe('TEAM_LEAD');
    expect(result.teams).toEqual([{ id: 'team-1', name: 'Team Alpha', teamLead: { id: 'tl', fullName: 'Tara Lead', loginName: 'tl' } }]);
    expect(result.coderCount).toBe(3);
    expect(result.teamMembers).toHaveLength(1);
  });

  it('derives an Auditor\'s client list from their assigned Projects', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ vendor: null, team: null, leadsTeam: null, vendorAssignments: [], auditorAssignments: [], role: 'AUDITOR' });
    const result: any = await service.me(auditor);
    expect(result.role).toBe('AUDITOR');
    expect(result.clients).toEqual([{ id: 'cl-1', name: 'Client X' }]);
  });

  it('a Vendor sees its own Vendor/Teams/Team Leads/Coders/Projects/active users, never another vendor\'s', async () => {
    prisma.user.count.mockResolvedValueOnce(5).mockResolvedValueOnce(9);
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'tl', fullName: 'Tara Lead', loginName: 'tl' }]).mockResolvedValueOnce([]);
    const result: any = await service.me(vendorUser);
    expect(result.role).toBe('VENDOR');
    expect(result.vendor).toEqual({ id: 'v-1', name: 'Acme Vendor', code: 'ACME', isActive: true });
    expect(result.coderCount).toBe(5);
    expect(result.activeUsers).toBe(9);
  });
});
