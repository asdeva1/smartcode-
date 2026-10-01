import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../../prisma/prisma.service';

const manager: AuthUser = { id: 'm', employeeId: 'E', loginName: 'm', email: 'm@x.local', role: 'MANAGER', teamId: null, isActive: true };
const teamLead: AuthUser = { ...manager, id: 'tl', role: 'TEAM_LEAD', teamId: 'team-1' };
const auditor: AuthUser = { ...manager, id: 'a', role: 'AUDITOR' };

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      client: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue({ id: 'cl' }), create: jest.fn(async ({ data }) => ({ id: 'cl', ...data })) },
      project: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'p' }),
        create: jest.fn(async ({ data }) => ({ id: 'p', ...data, isActive: true, client: { id: 'cl', name: 'C' }, team: null, _count: { charts: 0, auditorAssignments: 0 } })),
        // updateProject() now runs inside $transaction (tx === prisma here)
        // and every Phase 10A team-assignment/allocation-type test overrides
        // this per-call via mockResolvedValueOnce - it was previously
        // undefined here, so those overrides threw immediately.
        update: jest.fn(),
      },
      team: { findUnique: jest.fn().mockResolvedValue({ id: 'team-1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'a', role: 'AUDITOR' }) },
      auditorProjectAssignment: {
        create: jest.fn().mockResolvedValue({ id: 'asg' }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'asg', auditorId: 'a', projectId: 'p', assignedAt: new Date('2026-01-01'), isActive: true }),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, auditorId: 'a', projectId: 'p', ...data })),
      },
      // No vendor assignments unless a test sets one (cross-vendor checks, vendor-scope.ts).
      vendorAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      // Phase 10A: Project<->Team assignment history.
      projectTeamAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const moduleRef = await Test.createTestingModule({ providers: [ProjectsService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = moduleRef.get(ProjectsService);
  });

  it('is Manager-only for setup operations', async () => {
    await expect(service.listProjects(teamLead)).rejects.toThrow(ForbiddenException);
    await expect(service.createAssignment(auditor, { auditorId: 'a', projectId: 'p' })).rejects.toThrow(ForbiddenException);
  });

  it('creates a project for a team and logs it; rejects duplicate names per client', async () => {
    await service.createProject(manager, { clientId: 'cl', name: ' Cardio ', teamId: 'team-1' });
    expect(prisma.project.create.mock.calls[0][0].data).toEqual({ clientId: 'cl', name: 'Cardio', teamId: 'team-1' });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('PROJECT_CREATED');
    prisma.project.findFirst.mockResolvedValueOnce({ id: 'dup' });
    await expect(service.createProject(manager, { clientId: 'cl', name: 'Cardio' })).rejects.toThrow(ConflictException);
  });

  it('only assigns users with the AUDITOR role, and reports duplicates as 409', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'c', role: 'CODER' });
    await expect(service.createAssignment(manager, { auditorId: 'c', projectId: 'p' })).rejects.toThrow(BadRequestException);
    prisma.auditorProjectAssignment.create.mockRejectedValueOnce(Object.assign(new Error(), { code: 'P2002' }));
    await expect(service.createAssignment(manager, { auditorId: 'a', projectId: 'p' })).rejects.toThrow(ConflictException);
  });

  describe('deleteAssignment / listAssignments (Organization Assignment requirement - Auditor history)', () => {
    it('soft-deletes (isActive: false, removedAt/removedById) instead of hard-deleting, and logs it', async () => {
      const result = await service.deleteAssignment(manager, 'asg');
      expect(prisma.auditorProjectAssignment.update).toHaveBeenCalledWith({
        where: { id: 'asg' },
        data: expect.objectContaining({ isActive: false, removedById: manager.id }),
      });
      expect(result).toMatchObject({ id: 'asg' });
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('AUDITOR_UNASSIGNED');
    });

    it('rejects removing an already-removed assignment', async () => {
      prisma.auditorProjectAssignment.findUnique.mockResolvedValueOnce({ id: 'asg', auditorId: 'a', projectId: 'p', assignedAt: new Date(), isActive: false });
      await expect(service.deleteAssignment(manager, 'asg')).rejects.toThrow(ConflictException);
      expect(prisma.auditorProjectAssignment.update).not.toHaveBeenCalled();
    });

    it('listAssignments defaults to ACTIVE assignments only, and includeEnded=true returns the full history', async () => {
      await service.listAssignments(manager);
      expect(prisma.auditorProjectAssignment.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
      await service.listAssignments(manager, true);
      expect(prisma.auditorProjectAssignment.findMany.mock.calls[1][0].where).toEqual({});
    });
  });

  it('scopes "my projects" by role', async () => {
    await service.mine(teamLead);
    expect(prisma.project.findMany.mock.calls[0][0].where).toEqual({ teamId: 'team-1', isActive: true });
    await service.mine(auditor);
    expect(prisma.project.findMany.mock.calls[1][0].where).toEqual({ auditorAssignments: { some: { auditorId: 'a', isActive: true } }, isActive: true });
  });

  describe('Phase 10A: Project allocation type', () => {
    it('defaults a new project to no explicit allocationType (DB default AUTOMATIC applies) when omitted', async () => {
      await service.createProject(manager, { clientId: 'cl', name: 'Cardio', teamId: 'team-1' });
      expect(prisma.project.create.mock.calls[0][0].data).not.toHaveProperty('allocationType');
    });

    it('passes an explicit allocationType through on create, and logs it on update', async () => {
      await service.createProject(manager, { clientId: 'cl', name: 'Radiology', teamId: 'team-1', allocationType: 'MANUAL' });
      expect(prisma.project.create.mock.calls[0][0].data.allocationType).toBe('MANUAL');

      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p', name: 'Radiology', teamId: 'team-1', isActive: true, allocationType: 'AUTOMATIC' });
      prisma.project.update.mockResolvedValueOnce({
        id: 'p', name: 'Radiology', isActive: true, allocationType: 'MANUAL', client: { id: 'cl', name: 'C' }, team: null, _count: { charts: 0, auditorAssignments: 0 },
      });
      await service.updateProject(manager, 'p', { allocationType: 'MANUAL' });
      expect(prisma.project.update.mock.calls[0][0].data.allocationType).toBe('MANUAL');
      const log = prisma.auditLog.create.mock.calls.find((c: any) => c[0].data.action === 'PROJECT_UPDATED');
      expect(log[0].data.after.allocationType).toBe('MANUAL');
    });
  });

  describe('Phase 10A: Project<->Team assignment history', () => {
    it('is Manager-only', async () => {
      await expect(service.assignTeam(teamLead, 'p', { teamId: 'team-1' })).rejects.toThrow(ForbiddenException);
      await expect(service.unassignTeam(teamLead, 'p')).rejects.toThrow(ForbiddenException);
      await expect(service.listTeamAssignments(teamLead, 'p')).rejects.toThrow(ForbiddenException);
    });

    it('404s for an unknown project or team', async () => {
      prisma.project.findUnique.mockResolvedValueOnce(null);
      await expect(service.assignTeam(manager, 'missing', { teamId: 'team-1' })).rejects.toThrow('Project not found');
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p', teamId: null });
      prisma.team.findUnique.mockResolvedValueOnce(null);
      await expect(service.assignTeam(manager, 'p', { teamId: 'missing-team' })).rejects.toThrow('Team not found');
    });

    it('assigns a team, writes history and an audit log, and mirrors Project.teamId', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p', teamId: null });
      prisma.projectTeamAssignment.findFirst.mockResolvedValueOnce(null); // no prior active assignment
      prisma.projectTeamAssignment.create.mockResolvedValueOnce({ id: 'pta-1', projectId: 'p', teamId: 'team-1' });
      prisma.projectTeamAssignment.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'pta-1', project: { id: 'p', name: 'P' }, team: { id: 'team-1', name: 'Team Alpha' },
        isActive: true, assignedAt: new Date(), assignedBy: { id: 'm', fullName: null, employeeId: 'E', loginName: 'm' },
        unassignedAt: null, unassignedBy: null,
      });

      const result = await service.assignTeam(manager, 'p', { teamId: 'team-1' });

      expect(prisma.projectTeamAssignment.create.mock.calls[0][0].data).toMatchObject({ projectId: 'p', teamId: 'team-1', assignedById: 'm' });
      expect(prisma.project.update.mock.calls[0][0]).toEqual({ where: { id: 'p' }, data: { teamId: 'team-1' } });
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('PROJECT_TEAM_ASSIGNED');
      expect(result.team).toEqual({ id: 'team-1', name: 'Team Alpha' });
    });

    it('closes the previous active assignment (never deletes it) when reassigning to a different team', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p', teamId: 'team-1' });
      prisma.projectTeamAssignment.findFirst.mockResolvedValueOnce({ id: 'pta-old', projectId: 'p', teamId: 'team-1' });
      prisma.projectTeamAssignment.create.mockResolvedValueOnce({ id: 'pta-new', projectId: 'p', teamId: 'team-2' });
      prisma.projectTeamAssignment.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'pta-new', project: { id: 'p', name: 'P' }, team: { id: 'team-2', name: 'Team Beta' },
        isActive: true, assignedAt: new Date(), assignedBy: null, unassignedAt: null, unassignedBy: null,
      });

      await service.assignTeam(manager, 'p', { teamId: 'team-2' });

      expect(prisma.projectTeamAssignment.update.mock.calls[0]).toEqual([
        { where: { id: 'pta-old' }, data: { isActive: false, unassignedAt: expect.any(Date), unassignedById: 'm' } },
      ]);
      // The old row is closed (isActive:false), never deleted - no `delete` call exists on the mock at all.
      expect(prisma.projectTeamAssignment.delete).toBeUndefined();
    });

    it('is idempotent when re-assigning the same team (no-op, no duplicate active row)', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p', teamId: 'team-1' });
      prisma.projectTeamAssignment.findFirst.mockResolvedValueOnce({ id: 'pta-1', projectId: 'p', teamId: 'team-1' });
      prisma.projectTeamAssignment.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'pta-1', project: { id: 'p', name: 'P' }, team: { id: 'team-1', name: 'Team Alpha' },
        isActive: true, assignedAt: new Date(), assignedBy: null, unassignedAt: null, unassignedBy: null,
      });

      await service.assignTeam(manager, 'p', { teamId: 'team-1' });

      expect(prisma.projectTeamAssignment.create).not.toHaveBeenCalled();
      expect(prisma.projectTeamAssignment.update).not.toHaveBeenCalled();
    });

    it('unassigns a team, closing the active row and clearing Project.teamId', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p', teamId: 'team-1' });
      prisma.projectTeamAssignment.findFirst.mockResolvedValueOnce({ id: 'pta-1', projectId: 'p', teamId: 'team-1' });

      const result = await service.unassignTeam(manager, 'p');

      expect(prisma.projectTeamAssignment.update.mock.calls[0][0]).toEqual({
        where: { id: 'pta-1' },
        data: { isActive: false, unassignedAt: expect.any(Date), unassignedById: 'm' },
      });
      expect(prisma.project.update.mock.calls[0]).toEqual([{ where: { id: 'p' }, data: { teamId: null } }]);
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('PROJECT_TEAM_UNASSIGNED');
      expect(result).toEqual({ id: 'p', teamId: null });
    });

    it('rejects unassigning a project that has no team', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p', teamId: null });
      prisma.projectTeamAssignment.findFirst.mockResolvedValueOnce(null);
      await expect(service.unassignTeam(manager, 'p')).rejects.toThrow(ConflictException);
    });

    it('CORRECTED (architecture review): the legacy PATCH /manager/projects/:id { teamId } path now routes through the same history-creating transaction as assignTeam/unassignTeam - there is one source of truth', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p', name: 'P', teamId: 'team-1', isActive: true, allocationType: 'AUTOMATIC' });
      prisma.projectTeamAssignment.findFirst.mockResolvedValueOnce({ id: 'pta-old', projectId: 'p', teamId: 'team-1' });
      prisma.projectTeamAssignment.create.mockResolvedValueOnce({ id: 'pta-new', projectId: 'p', teamId: 'team-2' });
      // updateProject()'s transaction calls tx.project.update TWICE when the
      // team is changing: once inside closeAndOpenTeamAssignment (mirroring
      // Project.teamId onto the row; its return value is never read) and
      // once more for updateProject's own return value (the one that ends
      // up in the PROJECT_UPDATED audit log below). Queue a throwaway value
      // for the first call so the second (real) mockResolvedValueOnce below
      // lines up with the call whose result actually matters.
      prisma.project.update.mockResolvedValueOnce({ id: 'p' });
      prisma.project.update.mockResolvedValueOnce({
        id: 'p', name: 'P', isActive: true, allocationType: 'AUTOMATIC', teamId: 'team-2', client: { id: 'cl', name: 'C' }, team: { id: 'team-2', name: 'Beta' }, _count: { charts: 0, auditorAssignments: 0 },
      });

      await service.updateProject(manager, 'p', { teamId: 'team-2' });

      // The old row is closed (never deleted) and a new active row is created -
      // the exact same ProjectTeamAssignment history a dedicated assignTeam
      // call would produce.
      expect(prisma.projectTeamAssignment.update.mock.calls[0]).toEqual([
        { where: { id: 'pta-old' }, data: { isActive: false, unassignedAt: expect.any(Date), unassignedById: 'm' } },
      ]);
      expect(prisma.projectTeamAssignment.create.mock.calls[0][0].data).toMatchObject({ projectId: 'p', teamId: 'team-2', assignedById: 'm' });
      const teamLog = prisma.auditLog.create.mock.calls.find((c: any) => c[0].data.action === 'PROJECT_TEAM_ASSIGNED');
      expect(teamLog).toBeDefined();
      const projectLog = prisma.auditLog.create.mock.calls.find((c: any) => c[0].data.action === 'PROJECT_UPDATED');
      expect(projectLog[0].data.after.teamId).toBe('team-2');
    });

    it('CORRECTED: unassigning via legacy PATCH { teamId: null } also writes ProjectTeamAssignment history', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p', name: 'P', teamId: 'team-1', isActive: true, allocationType: 'AUTOMATIC' });
      prisma.projectTeamAssignment.findFirst.mockResolvedValueOnce({ id: 'pta-old', projectId: 'p', teamId: 'team-1' });
      // Same two-calls-to-tx.project.update situation as the test above:
      // one throwaway value for closeAndOpenTeamAssignment's internal call
      // (still made even when unassigning, to clear Project.teamId), then
      // the real one for updateProject's own return value.
      prisma.project.update.mockResolvedValueOnce({ id: 'p' });
      prisma.project.update.mockResolvedValueOnce({
        id: 'p', name: 'P', isActive: true, allocationType: 'AUTOMATIC', teamId: null, client: { id: 'cl', name: 'C' }, team: null, _count: { charts: 0, auditorAssignments: 0 },
      });

      await service.updateProject(manager, 'p', { teamId: null });

      expect(prisma.projectTeamAssignment.update.mock.calls[0]).toEqual([
        { where: { id: 'pta-old' }, data: { isActive: false, unassignedAt: expect.any(Date), unassignedById: 'm' } },
      ]);
      expect(prisma.projectTeamAssignment.create).not.toHaveBeenCalled();
      const teamLog = prisma.auditLog.create.mock.calls.find((c: any) => c[0].data.action === 'PROJECT_TEAM_UNASSIGNED');
      expect(teamLog).toBeDefined();
    });

    it('does not touch ProjectTeamAssignment when teamId is absent or unchanged in the patch', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p', name: 'P', teamId: 'team-1', isActive: true, allocationType: 'AUTOMATIC' });
      prisma.project.update.mockResolvedValueOnce({
        id: 'p', name: 'Renamed', isActive: true, allocationType: 'AUTOMATIC', teamId: 'team-1', client: { id: 'cl', name: 'C' }, team: { id: 'team-1', name: 'Alpha' }, _count: { charts: 0, auditorAssignments: 0 },
      });

      await service.updateProject(manager, 'p', { name: 'Renamed' });

      expect(prisma.projectTeamAssignment.findFirst).not.toHaveBeenCalled();
      expect(prisma.projectTeamAssignment.create).not.toHaveBeenCalled();
      expect(prisma.projectTeamAssignment.update).not.toHaveBeenCalled();
    });

    it('CORRECTED (final round): creating a Project WITHOUT a Team creates no ProjectTeamAssignment history', async () => {
      await service.createProject(manager, { clientId: 'cl', name: 'Neuro' });
      expect(prisma.projectTeamAssignment.create).not.toHaveBeenCalled();
      const actions = prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
      expect(actions).toEqual(['PROJECT_CREATED']);
    });

    it('CORRECTED (final round): creating a Project WITH a Team sets Project.teamId AND creates one active ProjectTeamAssignment, transactionally', async () => {
      const project = await service.createProject(manager, { clientId: 'cl', name: 'Cardio', teamId: 'team-1' });

      expect(prisma.project.create.mock.calls[0][0].data.teamId).toBe('team-1');
      expect(prisma.projectTeamAssignment.create).toHaveBeenCalledTimes(1);
      expect(prisma.projectTeamAssignment.create.mock.calls[0][0].data).toMatchObject({ projectId: 'p', teamId: 'team-1', assignedById: 'm' });
      // Both the Project.create and the ProjectTeamAssignment.create happen
      // inside the SAME $transaction call - proving they are one atomic unit.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const actions = prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
      expect(actions).toEqual(['PROJECT_CREATED', 'PROJECT_TEAM_ASSIGNED']);
      expect(project.team).toBeDefined();
    });

    it('CORRECTED (final round): a failed ProjectTeamAssignment write inside the transaction leaves NO partially-created Project - no PROJECT_CREATED or PROJECT_TEAM_ASSIGNED audit log is ever written', async () => {
      prisma.projectTeamAssignment.create.mockRejectedValueOnce(new Error('assignment failed'));
      await expect(service.createProject(manager, { clientId: 'cl', name: 'Ortho', teamId: 'team-1' })).rejects.toThrow('assignment failed');
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('lists assignment history for a project, most recent first (server-side ordering)', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({ id: 'p', teamId: 'team-1' });
      prisma.projectTeamAssignment.findMany.mockResolvedValueOnce([
        { id: 'pta-2', project: { id: 'p', name: 'P' }, team: { id: 'team-2', name: 'Beta' }, isActive: true, assignedAt: new Date(), assignedBy: null, unassignedAt: null, unassignedBy: null },
        { id: 'pta-1', project: { id: 'p', name: 'P' }, team: { id: 'team-1', name: 'Alpha' }, isActive: false, assignedAt: new Date(), assignedBy: null, unassignedAt: new Date(), unassignedBy: null },
      ]);
      const rows = await service.listTeamAssignments(manager, 'p');
      expect(rows).toHaveLength(2);
      expect(prisma.projectTeamAssignment.findMany.mock.calls[0][0]).toMatchObject({ where: { projectId: 'p' }, orderBy: { assignedAt: 'desc' } });
    });
  });
});
