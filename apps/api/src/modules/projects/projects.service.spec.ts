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
      },
      team: { findUnique: jest.fn().mockResolvedValue({ id: 'team-1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'a', role: 'AUDITOR' }) },
      auditorProjectAssignment: { create: jest.fn().mockResolvedValue({ id: 'asg' }), findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
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

  it('scopes "my projects" by role', async () => {
    await service.mine(teamLead);
    expect(prisma.project.findMany.mock.calls[0][0].where).toEqual({ teamId: 'team-1', isActive: true });
    await service.mine(auditor);
    expect(prisma.project.findMany.mock.calls[1][0].where).toEqual({ auditorAssignments: { some: { auditorId: 'a' } }, isActive: true });
  });
});
