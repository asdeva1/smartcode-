import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { writeAuditLog } from '../../common/audit-log';
import { PERSON_SELECT, isUniqueViolation, personRef } from '../../common/scope';
import { CreateAuditorAssignmentDto, CreateClientDto, CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

const PROJECT_INCLUDE = {
  client: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  _count: { select: { charts: true, auditorAssignments: true } },
} as const;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

function toProjectDto(p: ProjectRow) {
  return {
    id: p.id,
    name: p.name,
    isActive: p.isActive,
    client: p.client,
    team: p.team,
    chartCount: p._count.charts,
    auditorCount: p._count.auditorAssignments,
  };
}

/**
 * Manager-owned project setup that the Production/Audit workflow depends
 * on: a Chart belongs to a Project, a Project is worked by one Team, and
 * Auditors are scoped to Projects (docs/11-SCHEMA-DECISIONS.md Q6).
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertManager(caller: AuthUser) {
    if (caller.role !== 'MANAGER') throw new ForbiddenException('Only a Manager can manage projects and assignments');
  }

  async listClients(caller: AuthUser) {
    this.assertManager(caller);
    return this.prisma.client.findMany({ orderBy: { name: 'asc' } });
  }

  async createClient(caller: AuthUser, dto: CreateClientDto) {
    this.assertManager(caller);
    const name = dto.name.trim();
    const existing = await this.prisma.client.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (existing) throw new ConflictException('A client with this name already exists');
    const client = await this.prisma.client.create({ data: { name } });
    await writeAuditLog(this.prisma, caller, 'CLIENT_CREATED', 'Client', client.id, { after: { name } });
    return client;
  }

  async listProjects(caller: AuthUser) {
    this.assertManager(caller);
    const rows = await this.prisma.project.findMany({ include: PROJECT_INCLUDE, orderBy: { name: 'asc' } });
    return rows.map(toProjectDto);
  }

  private async assertTeam(teamId: string | null | undefined) {
    if (!teamId) return;
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found');
  }

  async createProject(caller: AuthUser, dto: CreateProjectDto) {
    this.assertManager(caller);
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Client not found');
    await this.assertTeam(dto.teamId);
    const name = dto.name.trim();
    const dup = await this.prisma.project.findFirst({
      where: { clientId: dto.clientId, name: { equals: name, mode: 'insensitive' } },
    });
    if (dup) throw new ConflictException('This client already has a project with this name');
    const project = await this.prisma.project.create({
      data: { clientId: dto.clientId, name, teamId: dto.teamId ?? null },
      include: PROJECT_INCLUDE,
    });
    await writeAuditLog(this.prisma, caller, 'PROJECT_CREATED', 'Project', project.id, {
      after: { name, clientId: dto.clientId, teamId: dto.teamId ?? null },
    });
    return toProjectDto(project);
  }

  async updateProject(caller: AuthUser, id: string, dto: UpdateProjectDto) {
    this.assertManager(caller);
    const before = await this.prisma.project.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Project not found');
    if (dto.teamId !== undefined) await this.assertTeam(dto.teamId);
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: PROJECT_INCLUDE,
    });
    await writeAuditLog(this.prisma, caller, 'PROJECT_UPDATED', 'Project', id, {
      before: { name: before.name, teamId: before.teamId, isActive: before.isActive },
      after: { name: project.name, teamId: project.teamId, isActive: project.isActive },
    });
    return toProjectDto(project);
  }

  async listAssignments(caller: AuthUser) {
    this.assertManager(caller);
    const rows = await this.prisma.auditorProjectAssignment.findMany({
      include: {
        auditor: { select: PERSON_SELECT },
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      },
      orderBy: { assignedAt: 'desc' },
    });
    return rows.map((r) => ({ id: r.id, assignedAt: r.assignedAt, auditor: personRef(r.auditor), project: r.project }));
  }

  async createAssignment(caller: AuthUser, dto: CreateAuditorAssignmentDto) {
    this.assertManager(caller);
    const [auditor, project] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.auditorId } }),
      this.prisma.project.findUnique({ where: { id: dto.projectId } }),
    ]);
    if (!auditor || auditor.role !== 'AUDITOR') throw new BadRequestException('auditorId must reference an Auditor');
    if (!project) throw new NotFoundException('Project not found');
    try {
      const row = await this.prisma.auditorProjectAssignment.create({
        data: { auditorId: dto.auditorId, projectId: dto.projectId },
      });
      await writeAuditLog(this.prisma, caller, 'AUDITOR_ASSIGNED', 'AuditorProjectAssignment', row.id, {
        after: { auditorId: dto.auditorId, projectId: dto.projectId },
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('This Auditor is already assigned to this project');
      throw e;
    }
  }

  async deleteAssignment(caller: AuthUser, id: string) {
    this.assertManager(caller);
    const row = await this.prisma.auditorProjectAssignment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Assignment not found');
    await this.prisma.auditorProjectAssignment.delete({ where: { id } });
    await writeAuditLog(this.prisma, caller, 'AUDITOR_UNASSIGNED', 'AuditorProjectAssignment', id, {
      before: { auditorId: row.auditorId, projectId: row.projectId },
    });
    return { id };
  }

  /** Projects the caller works in: team projects (Coder/TL), assigned projects (Auditor), all (Manager). */
  async mine(caller: AuthUser) {
    const where: Prisma.ProjectWhereInput =
      caller.role === 'MANAGER'
        ? {}
        : caller.role === 'AUDITOR'
          ? { auditorAssignments: { some: { auditorId: caller.id } } }
          : { teamId: caller.teamId ?? '__none__' };
    const rows = await this.prisma.project.findMany({
      where: { ...where, isActive: true },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((p) => ({ id: p.id, name: p.name, client: p.client }));
  }
}
