import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { UsersService } from './users.service';
import { ProjectsService } from '../projects/projects.service';
import type { LoginNameAllocationService } from '../login-name-allocations/login-name-allocation.service';

const manager: AuthUser = { id: 'm', employeeId: 'E', loginName: 'm', email: 'm@x.local', role: 'MANAGER', teamId: null, isActive: true };
const teamLead: AuthUser = { ...manager, id: 'tl', role: 'TEAM_LEAD', teamId: 'team-1' };
const V = 'vendor-a';

describe('Users: vendor accounts, vendor filters and cross-vendor team changes', () => {
  let prisma: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'va', role: 'VENDOR', isActive: true, teamId: null }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }) => ({ id: 'new', ...data })),
        update: jest.fn(async ({ data }) => ({ id: 'va', role: 'VENDOR', ...data })),
      },
      team: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      vendorAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      auditorProjectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    // None of these vendor-account tests exercise changeLoginName, so a
    // plain never-called stub is enough - the constructor now requires this
    // argument (Phase 9 added this dependency).
    const loginNameAllocations = { reallocate: jest.fn() } as unknown as LoginNameAllocationService;
    service = new UsersService(prisma, loginNameAllocations);
  });

  it('only a Manager can create a Vendor account, and it is linked to its vendor', async () => {
    const dto = { employeeId: 'E9', fullName: 'Ops', loginName: 'ops', email: 'o@x.local', password: 'Password1' };
    await service.createWithRole(manager, 'VENDOR', dto, { vendorId: V });
    expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({ role: 'VENDOR', vendorId: V, createdById: 'm' });
    await expect(service.createWithRole(teamLead, 'VENDOR', dto, { vendorId: V })).rejects.toThrow(ForbiddenException);
    // vendorId is never set on non-vendor accounts
    await service.createWithRole(manager, 'AUDITOR', dto, { vendorId: V });
    expect(prisma.user.create.mock.calls[1][0].data).not.toHaveProperty('vendorId');
  });

  it('a Manager can activate / deactivate Vendor accounts; a Team Lead cannot', async () => {
    await service.setActive(manager, 'va', false);
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('USER_DEACTIVATED');
    await expect(service.setActive(teamLead, 'va', false)).rejects.toThrow(ForbiddenException);
  });

  it('filters the Team Lead and Auditor lists by active vendor assignment and shows the vendor', async () => {
    prisma.user.findMany.mockResolvedValueOnce([{ id: 't', role: 'TEAM_LEAD', team: null, vendorAssignments: [{ vendor: { id: V, name: 'Alpha' } }] }]);
    const r = await service.findTeamLeads(manager, { page: 1, pageSize: 25, status: 'all', vendorId: V } as any);
    expect(prisma.user.findMany.mock.calls[0][0].where.vendorAssignments).toEqual({ some: { vendorId: V, isActive: true } });
    expect(r.data[0].vendor).toEqual({ id: V, name: 'Alpha' });
    await service.findAuditors(manager, { page: 1, pageSize: 25, vendorId: V });
    expect(prisma.user.findMany.mock.calls[1][0].where).toEqual({ role: 'AUDITOR', vendorAssignments: { some: { vendorId: V, isActive: true } } });
  });

  it('refuses to hand a team to a Team Lead of another vendor while that team\'s projects have this vendor\'s Auditors', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'tl-b', role: 'TEAM_LEAD', fullName: 'B', email: 'b@x', employeeId: 'EB', teamId: null, team: null });
    prisma.team.findUnique.mockResolvedValue({ id: 'team-1', teamLeadId: null, projects: [{ id: 'p-1' }] });
    prisma.vendorAssignment.findFirst.mockResolvedValue({ vendorId: 'vendor-b' }); // the Team Lead's vendor
    prisma.auditorProjectAssignment.findMany.mockResolvedValue([
      { project: { name: 'Cardio' }, auditor: { fullName: 'Ava', loginName: 'ava', vendorAssignments: [{ vendorId: V }] } },
    ]);
    await expect(service.updateTeamLead(manager, 'tl-b', { teamId: 'team-1' } as any)).rejects.toThrow(ConflictException);
    expect(prisma.team.update).not.toHaveBeenCalled();
  });
});

describe('Projects: no cross-vendor Auditor assignments', () => {
  let prisma: any;
  let service: ProjectsService;
  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'aud', role: 'AUDITOR' }) },
      project: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p-1', teamId: 'team-1', name: 'Cardio', isActive: true }),
        update: jest.fn(async ({ data }) => ({ id: 'p-1', name: 'Cardio', isActive: true, teamId: data.teamId, client: null, team: null, _count: { charts: 0, auditorAssignments: 1 } })),
      },
      team: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, teamLeadId: where.id === 'team-1' ? 'tl-a' : 'tl-b' })) },
      vendorAssignment: { findFirst: jest.fn(async ({ where }) => ({ aud: { vendorId: V }, 'tl-a': { vendorId: V }, 'tl-b': { vendorId: 'vendor-b' } } as any)[where.userId] ?? null) },
      auditorProjectAssignment: {
        create: jest.fn().mockResolvedValue({ id: 'asg' }),
        findMany: jest.fn().mockResolvedValue([{ project: { name: 'Cardio' }, auditor: { fullName: 'Ava', loginName: 'ava', vendorAssignments: [{ vendorId: V }] } }]),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      // ProjectsService.updateProject() now wraps its work in a Prisma
      // transaction (Phase 10 team-assignment history); tx === prisma here,
      // matching the pattern used elsewhere, so the existing project.update
      // stub above is reached via tx.project.update as well.
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    service = new ProjectsService(prisma);
  });

  it('allows a vendor Auditor on the same vendor\'s project, refuses another vendor\'s', async () => {
    await expect(service.createAssignment(manager, { auditorId: 'aud', projectId: 'p-1' })).resolves.toMatchObject({ id: 'asg' });
    prisma.project.findUnique.mockResolvedValue({ id: 'p-2', teamId: 'team-2' });
    await expect(service.createAssignment(manager, { auditorId: 'aud', projectId: 'p-2' })).rejects.toThrow(/Cross-vendor assignments are not allowed/);
    expect(prisma.auditorProjectAssignment.create).toHaveBeenCalledTimes(1);
  });

  it('refuses to move a project to another vendor\'s team while it has this vendor\'s Auditors', async () => {
    await expect(service.updateProject(manager, 'p-1', { teamId: 'team-2' })).rejects.toThrow(/cross-vendor access is not allowed/);
    expect(prisma.project.update).not.toHaveBeenCalled();
    await expect(service.updateProject(manager, 'p-1', { name: 'Renamed' })).resolves.toBeDefined();
  });
});
