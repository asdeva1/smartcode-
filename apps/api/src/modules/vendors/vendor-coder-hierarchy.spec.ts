import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { UsersService } from '../users/users.service';
import { CodersService } from '../users/coders.service';
import { ExportService } from '../../common/export/export.service';
import { VendorsService } from './vendors.service';

/**
 * docs/09-BUSINESS-RULES.md "Vendor -> Team Lead -> Coder Hierarchy" /
 * "Coder Creation From Vendor Portal" / "Project Auto-Assignment" (the
 * Coder side). Covers section 18's test items 1-6, 11-12.
 */
const V = 'vendor-a';
const manager: AuthUser = { id: 'm', employeeId: 'E', loginName: 'm', email: 'm@x.local', role: 'MANAGER', teamId: null, isActive: true };
const vendorCaller: AuthUser = { id: 'ven', employeeId: 'EV', loginName: 'ven', email: 'ven@x.local', role: 'VENDOR', teamId: null, vendorId: V, isActive: true };
const teamLeadCaller: AuthUser = { id: 'tl-1', employeeId: 'ET', loginName: 'tl', email: 'tl@x.local', role: 'TEAM_LEAD', teamId: 'team-1', isActive: true };
const coderDto = { employeeId: 'EC1', fullName: 'New Coder', loginName: 'new.coder', email: 'nc@x.local', password: 'Password1!', confirmPassword: 'Password1!' };

describe('UsersService.createCoder - Vendor Portal + Team Lead creation, hierarchy items 1-3, 6', () => {
  let prisma: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({ id: 'new-coder', ...data })),
        update: jest.fn(async ({ data }) => ({ id: 'new-coder', role: 'CODER', ...data })),
      },
      vendorAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    service = new UsersService(prisma);
  });

  it('[item 1/2] a Vendor creates a Coder, which receives vendorId = the caller\'s own vendor', async () => {
    const result = await service.createCoder(vendorCaller, coderDto);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ role: 'CODER', vendorId: V, createdById: 'ven' });
    expect(data.teamId).toBeUndefined(); // no Team Lead assigned to the vendor yet
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('[item 3] a Vendor-created Coder inherits the vendor\'s currently-assigned active Team Lead\'s team', async () => {
    prisma.vendorAssignment.findFirst.mockResolvedValueOnce({ user: { leadsTeam: { id: 'team-9' } } });
    await service.createCoder(vendorCaller, coderDto);
    expect(prisma.vendorAssignment.findFirst.mock.calls[0][0].where).toEqual({ vendorId: V, role: 'TEAM_LEAD', isActive: true });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ vendorId: V, teamId: 'team-9' });
  });

  it('[item 6] a Team-Lead-created Coder inherits the Team Lead\'s own active vendor, so it is tracked for future cascades', async () => {
    prisma.vendorAssignment.findFirst.mockResolvedValueOnce({ vendorId: V }); // the Team Lead's own vendor assignment
    await service.createCoder(teamLeadCaller, coderDto);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ role: 'CODER', teamId: 'team-1', vendorId: V, createdById: 'tl-1' });
  });

  it('a Team Lead with no vendor creates a Coder with no vendorId (unaffected, existing behaviour)', async () => {
    await service.createCoder(teamLeadCaller, coderDto);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ role: 'CODER', teamId: 'team-1' });
    expect(data.vendorId).toBeUndefined();
  });

  it('rejects any other role trying to create a Coder', async () => {
    await expect(service.createCoder(manager, coderDto)).rejects.toThrow(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('a Vendor without an active vendor (broken account) is rejected, not silently scoped to nothing', async () => {
    await expect(service.createCoder({ ...vendorCaller, vendorId: null }, coderDto)).rejects.toThrow(ForbiddenException);
  });
});

describe('VendorsService.assignTeamLead - hierarchy items 4, 5', () => {
  let prisma: any;
  let users: any;
  let service: VendorsService;

  const teamLeadRow = (id: string, over: Record<string, unknown> = {}) => ({
    id, role: 'TEAM_LEAD', fullName: `TL ${id}`, employeeId: `E-${id}`, loginName: `${id}.login`, email: `${id}@x.local`,
    isActive: true, leadsTeam: null, ...over,
  });

  beforeEach(() => {
    prisma = {
      vendor: { findUnique: jest.fn().mockResolvedValue({ id: V, name: 'Alpha', isActive: true }) },
      vendorAssignment: {
        findFirst: jest.fn().mockResolvedValue(null), // no previous Team Lead, no cross-vendor conflicts
        create: jest.fn(async ({ data }) => ({ id: 'asg-1', assignedAt: new Date(), ...data })),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      team: { create: jest.fn(async ({ data }) => ({ id: 'team-new', ...data })) },
      auditorProjectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    users = {};
    service = new VendorsService(prisma, users);
  });

  it("[item 4] assigns a Team Lead who already has a Team - every active Coder under the vendor moves onto it, none skipped", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(teamLeadRow('tl-1', { leadsTeam: { id: 'team-1', projects: [] } })) // assign()'s own lookup
      .mockResolvedValueOnce({ id: 'tl-1', fullName: 'TL tl-1', loginName: 'tl-1.login', leadsTeam: { id: 'team-1' } }); // assignTeamLead()'s team lookup
    prisma.user.updateMany.mockResolvedValueOnce({ count: 3 });

    const result = await service.assignTeamLead(manager, V, 'tl-1');

    expect(prisma.vendorAssignment.create.mock.calls[0][0].data).toMatchObject({ vendorId: V, userId: 'tl-1', role: 'TEAM_LEAD' });
    expect(prisma.team.create).not.toHaveBeenCalled(); // already has a team - not recreated
    expect(prisma.user.updateMany.mock.calls[0][0]).toEqual({ where: { role: 'CODER', vendorId: V, isActive: true }, data: { teamId: 'team-1' } });
    expect(result).toMatchObject({ teamId: 'team-1', codersMoved: 3 });
    expect(prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action)).toContain('VENDOR_TEAM_LEAD_CODERS_CASCADED');
  });

  it('auto-creates a Team for a Team Lead who does not have one yet, then cascades onto it', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(teamLeadRow('tl-2', { leadsTeam: null }))
      .mockResolvedValueOnce({ id: 'tl-2', fullName: 'TL tl-2', loginName: 'tl-2.login', leadsTeam: null });

    const result = await service.assignTeamLead(manager, V, 'tl-2');

    expect(prisma.team.create.mock.calls[0][0].data).toMatchObject({ teamLeadId: 'tl-2' });
    expect(prisma.user.updateMany.mock.calls[0][0].data).toEqual({ teamId: 'team-new' });
    expect(result.teamId).toBe('team-new');
  });

  it("[item 5] replaces the vendor's previous Team Lead - existing active Coders move from TL-01's team to TL-02's, none left stale", async () => {
    prisma.vendorAssignment.findFirst
      .mockResolvedValueOnce({ userId: 'tl-01' }) // an existing active Team Lead for this vendor
      .mockResolvedValueOnce({ id: 'asg-01', vendorId: V, userId: 'tl-01', role: 'TEAM_LEAD', isActive: true, assignedAt: new Date() }) // unassign()'s lookup of that row
      .mockResolvedValueOnce(null); // assign()'s own-user duplicate check for tl-02
    prisma.user.findUnique
      .mockResolvedValueOnce(teamLeadRow('tl-02', { leadsTeam: { id: 'team-02', projects: [] } }))
      .mockResolvedValueOnce({ id: 'tl-02', fullName: 'TL tl-02', loginName: 'tl-02.login', leadsTeam: { id: 'team-02' } });
    prisma.user.updateMany.mockResolvedValueOnce({ count: 5 });

    const result = await service.assignTeamLead(manager, V, 'tl-02');

    // The old Team Lead's assignment was ended (history, not deleted).
    expect(prisma.vendorAssignment.update.mock.calls[0][0]).toMatchObject({ where: { id: 'asg-01' }, data: { isActive: false } });
    // The new Team Lead was assigned.
    expect(prisma.vendorAssignment.create.mock.calls[0][0].data).toMatchObject({ userId: 'tl-02' });
    // Every active Coder under the vendor - tracked by vendorId, not by the old team - moved directly onto TL-02's team.
    expect(prisma.user.updateMany.mock.calls[0][0]).toEqual({ where: { role: 'CODER', vendorId: V, isActive: true }, data: { teamId: 'team-02' } });
    expect(result.codersMoved).toBe(5);
  });
});

describe('VendorsService.removeTeamLead - no stale Team Lead relationships left behind', () => {
  it('detaches (teamId -> null) every active Coder under the vendor when its Team Lead is removed with no replacement', async () => {
    const prisma: any = {
      vendor: { findUnique: jest.fn().mockResolvedValue({ id: V, name: 'Alpha', isActive: true }) },
      vendorAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'asg-1', vendorId: V, userId: 'tl-1', role: 'TEAM_LEAD', isActive: true, assignedAt: new Date() }), update: jest.fn().mockResolvedValue({}) },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new VendorsService(prisma, {} as any);
    const result = await service.removeTeamLead(manager, V, 'tl-1');
    expect(prisma.user.updateMany.mock.calls[0][0]).toEqual({ where: { role: 'CODER', vendorId: V, isActive: true }, data: { teamId: null } });
    expect(result.codersDetached).toBe(2);
  });
});

describe('CodersService - Vendor Portal scope, hierarchy item 12', () => {
  let prisma: any;
  let service: CodersService;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    service = new CodersService(prisma, new ExportService());
  });

  it("scopes the Vendor Portal's Coder list to the caller's own vendor only", async () => {
    await service.list(vendorCaller, { page: 1, pageSize: 25, status: 'all' });
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ role: 'CODER', vendorId: V });
  });

  it("[item 12] a Vendor cannot view a Coder outside its own vendor - same 404 as not existing", async () => {
    prisma.user.findFirst.mockResolvedValueOnce(null); // the Coder belongs to a different vendor - the scoped query finds nothing
    await expect(service.get(vendorCaller, 'other-vendors-coder')).rejects.toThrow(NotFoundException);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'other-vendors-coder', role: 'CODER', vendorId: V });
  });

  it('rejects a Vendor account with no active vendor rather than matching every vendorless Coder', async () => {
    await expect(service.list({ ...vendorCaller, vendorId: null }, { page: 1, pageSize: 25, status: 'all' })).rejects.toThrow(ForbiddenException);
  });
});
