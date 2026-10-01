import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { writeAuditLog } from '../../common/audit-log';
import { PERSON_SELECT, isUniqueViolation, personRef } from '../../common/scope';
import {
  assertAuditorFitsProject,
  assertProjectAuditorsFit,
  auditorProjectWhere,
  requireVendor,
  teamVendorId,
  vendorProjectWhere,
} from '../../common/vendor-scope';
import { PERSON_SELECT as PROJECT_PERSON_SELECT, personRef as projectPersonRef } from '../../common/scope';
import { AssignProjectTeamDto, CreateAuditorAssignmentDto, CreateClientDto, CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

const PROJECT_INCLUDE = {
  client: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  _count: { select: { charts: true, auditorAssignments: { where: { isActive: true } } } },
} as const;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

function toProjectDto(p: ProjectRow) {
  return {
    id: p.id,
    name: p.name,
    isActive: p.isActive,
    allocationType: p.allocationType,
    client: p.client,
    team: p.team,
    chartCount: p._count.charts,
    auditorCount: p._count.auditorAssignments,
  };
}

const TEAM_ASSIGNMENT_INCLUDE = {
  project: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  assignedBy: { select: PROJECT_PERSON_SELECT },
  unassignedBy: { select: PROJECT_PERSON_SELECT },
} as const;

type TeamAssignmentRow = Prisma.ProjectTeamAssignmentGetPayload<{ include: typeof TEAM_ASSIGNMENT_INCLUDE }>;

function toTeamAssignmentDto(row: TeamAssignmentRow) {
  return {
    id: row.id,
    project: row.project,
    team: row.team,
    isActive: row.isActive,
    assignedAt: row.assignedAt,
    assignedBy: row.assignedBy ? projectPersonRef(row.assignedBy) : null,
    unassignedAt: row.unassignedAt,
    unassignedBy: row.unassignedBy ? projectPersonRef(row.unassignedBy) : null,
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

  /**
   * CORRECTED (final round): a Project created with a Team must NOT leave
   * ProjectTeamAssignment history empty while Project.teamId is set - that
   * was inconsistent with every other path that changes a Project's team
   * (assignTeam/unassignTeam/legacy PATCH updateProject, all of which go
   * through closeAndOpenTeamAssignment above). Project creation and its
   * ProjectTeamAssignment row are therefore created in the SAME
   * transaction here - they succeed or fail together, so a failed
   * assignment write can never leave a partially-created Project behind.
   * There is no `previous` row to close (the Project did not exist a
   * moment ago), so this does not call the shared closeAndOpenTeamAssignment
   * helper - it uses the exact same ProjectTeamAssignment shape (projectId,
   * teamId, assignedById) that helper's own "open a new active row" step
   * uses, so the resulting history row is indistinguishable in shape from
   * one created via assignTeam.
   *
   * Both audit log writes stay OUTSIDE the transaction, in the same
   * PROJECT_CREATED-then-PROJECT_TEAM_ASSIGNED order used before this
   * correction, so existing call-order expectations for project-creation
   * audit logging are unaffected.
   */
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

    const project = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.project.create({
        data: {
          clientId: dto.clientId,
          name,
          teamId: dto.teamId ?? null,
          ...(dto.allocationType !== undefined ? { allocationType: dto.allocationType } : {}),
        },
        include: PROJECT_INCLUDE,
      });
      if (dto.teamId) {
        await tx.projectTeamAssignment.create({ data: { projectId: created.id, teamId: dto.teamId, assignedById: caller.id } });
      }
      return created;
    });

    await writeAuditLog(this.prisma, caller, 'PROJECT_CREATED', 'Project', project.id, {
      after: { name, clientId: dto.clientId, teamId: dto.teamId ?? null, allocationType: project.allocationType },
    });
    if (dto.teamId) {
      await writeAuditLog(this.prisma, caller, 'PROJECT_TEAM_ASSIGNED', 'ProjectTeamAssignment', null, {
        after: { projectId: project.id, teamId: dto.teamId },
      });
    }
    return toProjectDto(project);
  }

  /**
   * Phase 10A (CORRECTED per architecture review): the single, shared
   * transactional core for every path that changes a Project's team -
   * `assignTeam`, `unassignTeam`, AND the legacy
   * `PATCH /manager/projects/:id { teamId }` path via `updateProject`
   * below. There is now exactly ONE way a Project's team relationship
   * changes at the database level - closes `previous` (never deletes it),
   * opens a new active row when newTeamId is non-null, and mirrors the
   * result onto Project.teamId - so ProjectTeamAssignment history can
   * never silently miss a team change regardless of which API a caller
   * used. Callers fetch `previous` themselves (they each need it anyway,
   * for their own idempotency/precondition checks) and pass it in, so this
   * helper never issues a redundant second lookup of the same row.
   */
  private async closeAndOpenTeamAssignment(
    tx: Prisma.TransactionClient,
    caller: AuthUser,
    projectId: string,
    previous: { id: string; teamId: string } | null,
    newTeamId: string | null,
    action: 'PROJECT_TEAM_ASSIGNED' | 'PROJECT_TEAM_UNASSIGNED',
  ) {
    if (previous) {
      await tx.projectTeamAssignment.update({
        where: { id: previous.id },
        data: { isActive: false, unassignedAt: new Date(), unassignedById: caller.id },
      });
    }
    const created = newTeamId ? await tx.projectTeamAssignment.create({ data: { projectId, teamId: newTeamId, assignedById: caller.id } }) : null;
    await tx.project.update({ where: { id: projectId }, data: { teamId: newTeamId } });
    await writeAuditLog(tx, caller, action, 'ProjectTeamAssignment', created?.id ?? previous?.id ?? null, {
      before: { teamId: previous?.teamId ?? null },
      after: { teamId: newTeamId },
    });
    return created ?? previous;
  }

  /**
   * The legacy `PATCH /manager/projects/:id { teamId }` path (CORRECTED
   * per architecture review): there is no longer a second, silent way to
   * change a Project's team. When `teamId` is included in the patch and
   * differs from the current value, this now routes through the exact
   * same `closeAndOpenTeamAssignment` transaction that `assignTeam`/
   * `unassignTeam` use below, so ProjectTeamAssignment history is created
   * consistently no matter which endpoint a caller uses. When `teamId` is
   * NOT part of the patch (or unchanged), this behaves exactly as before.
   */
  async updateProject(caller: AuthUser, id: string, dto: UpdateProjectDto) {
    this.assertManager(caller);
    const before = await this.prisma.project.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Project not found');
    const teamChanging = dto.teamId !== undefined && dto.teamId !== before.teamId;
    if (dto.teamId !== undefined) {
      await this.assertTeam(dto.teamId);
      if (teamChanging) {
        // Moving the project to another team moves it to that team's vendor
        // (or to "no vendor" when unassigned entirely via teamId: null).
        await assertProjectAuditorsFit(this.prisma, [id], dto.teamId ? await teamVendorId(this.prisma, dto.teamId) : null, 'Cannot change the team');
      }
    }

    const project = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (teamChanging) {
        const previous = await tx.projectTeamAssignment.findFirst({ where: { projectId: id, isActive: true } });
        await this.closeAndOpenTeamAssignment(tx, caller, id, previous, dto.teamId ?? null, dto.teamId ? 'PROJECT_TEAM_ASSIGNED' : 'PROJECT_TEAM_UNASSIGNED');
      }
      return tx.project.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.allocationType !== undefined ? { allocationType: dto.allocationType } : {}),
        },
        include: PROJECT_INCLUDE,
      });
    });
    await writeAuditLog(this.prisma, caller, 'PROJECT_UPDATED', 'Project', id, {
      before: { name: before.name, teamId: before.teamId, isActive: before.isActive, allocationType: before.allocationType },
      after: { name: project.name, teamId: project.teamId, isActive: project.isActive, allocationType: project.allocationType },
    });
    return toProjectDto(project);
  }

  /**
   * Phase 10A: assign a Project's Team with full history. As of this
   * correction, this and the legacy `PATCH /manager/projects/:id { teamId }`
   * path above both route through the SAME `closeAndOpenTeamAssignment`
   * transaction - there is exactly one source of truth for
   * ProjectTeamAssignment history, not two behaviors.
   */
  async assignTeam(caller: AuthUser, projectId: string, dto: AssignProjectTeamDto) {
    this.assertManager(caller);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const team = await this.prisma.team.findUnique({ where: { id: dto.teamId } });
    if (!team) throw new NotFoundException('Team not found');

    if (project.teamId !== dto.teamId) {
      await assertProjectAuditorsFit(this.prisma, [projectId], await teamVendorId(this.prisma, dto.teamId), 'Cannot assign this team');
    }

    const row = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const previous = await tx.projectTeamAssignment.findFirst({ where: { projectId, isActive: true } });
      if (previous && previous.teamId === dto.teamId) return previous; // already assigned to this team - idempotent no-op
      return this.closeAndOpenTeamAssignment(tx, caller, projectId, previous, dto.teamId, 'PROJECT_TEAM_ASSIGNED');
    });

    const full = await this.prisma.projectTeamAssignment.findUniqueOrThrow({ where: { id: row!.id }, include: TEAM_ASSIGNMENT_INCLUDE });
    return toTeamAssignmentDto(full);
  }

  /** Phase 10A: unassign a Project's current Team, preserving history (closes the active row rather than deleting it). */
  async unassignTeam(caller: AuthUser, projectId: string) {
    this.assertManager(caller);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const active = await this.prisma.projectTeamAssignment.findFirst({ where: { projectId, isActive: true } });
    if (!active && !project.teamId) throw new ConflictException('This project has no team assigned');

    // Mirrors the legacy `PATCH .../:id { teamId: null }` path's existing
    // rule: a project with no team is "no vendor" - reject if any assigned
    // Auditor belongs to a vendor.
    await assertProjectAuditorsFit(this.prisma, [projectId], null, 'Cannot unassign this team');

    await this.prisma.$transaction((tx: Prisma.TransactionClient) => this.closeAndOpenTeamAssignment(tx, caller, projectId, active, null, 'PROJECT_TEAM_UNASSIGNED'));
    return { id: projectId, teamId: null };
  }

  /** Phase 10A: full assign/unassign history for one Project, most recent first. */
  async listTeamAssignments(caller: AuthUser, projectId: string) {
    this.assertManager(caller);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const rows = await this.prisma.projectTeamAssignment.findMany({
      where: { projectId },
      include: TEAM_ASSIGNMENT_INCLUDE,
      orderBy: { assignedAt: 'desc' },
    });
    return rows.map(toTeamAssignmentDto);
  }

  /**
   * Active assignments only, by default - `includeEnded` (Organization
   * Assignment requirement item "historical assignments remain intact")
   * opts into the full history, kept as a separate flag rather than the
   * default so every existing caller of this list keeps seeing exactly
   * what it saw before the soft-delete change below (currently-active
   * assignments), while a full audit trail is still one query away.
   */
  async listAssignments(caller: AuthUser, includeEnded = false) {
    this.assertManager(caller);
    const rows = await this.prisma.auditorProjectAssignment.findMany({
      where: includeEnded ? {} : { isActive: true },
      include: {
        auditor: { select: PERSON_SELECT },
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      },
      orderBy: { assignedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      assignedAt: r.assignedAt,
      isActive: r.isActive,
      removedAt: r.removedAt,
      auditor: personRef(r.auditor),
      project: r.project,
    }));
  }

  async createAssignment(caller: AuthUser, dto: CreateAuditorAssignmentDto) {
    this.assertManager(caller);
    const [auditor, project] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.auditorId } }),
      this.prisma.project.findUnique({ where: { id: dto.projectId } }),
    ]);
    if (!auditor || auditor.role !== 'AUDITOR') throw new BadRequestException('auditorId must reference an Auditor');
    if (!project) throw new NotFoundException('Project not found');
    await assertAuditorFitsProject(this.prisma, dto.auditorId, dto.projectId);
    try {
      // A previously-ended assignment for this exact pair (isActive: false)
      // is left alone as history - the partial unique index below only
      // constrains ACTIVE rows, so re-assigning after an earlier removal
      // always creates a brand-new row rather than reviving the old one.
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

  /**
   * "Reassign Auditor" (Organization Assignment requirement section 11) -
   * soft-deletes the assignment (isActive: false, removedAt/removedById)
   * instead of the previous hard DELETE, so "historical assignments
   * remain intact" holds for Auditors the same way it already does for
   * every other assignment ledger in this schema (VendorAssignment,
   * ProjectTeamAssignment, ChartAllocation, TeamMembership). The Auditor
   * account, and every AuditEntry they ever wrote, is completely
   * untouched - this only ends their authorization to see this Project's
   * queue going forward.
   */
  async deleteAssignment(caller: AuthUser, id: string) {
    this.assertManager(caller);
    const row = await this.prisma.auditorProjectAssignment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Assignment not found');
    if (!row.isActive) throw new ConflictException('This assignment has already been removed');
    const removedAt = new Date();
    await this.prisma.auditorProjectAssignment.update({
      where: { id },
      data: { isActive: false, removedAt, removedById: caller.id },
    });
    await writeAuditLog(this.prisma, caller, 'AUDITOR_UNASSIGNED', 'AuditorProjectAssignment', id, {
      before: { auditorId: row.auditorId, projectId: row.projectId, assignedAt: row.assignedAt.toISOString() },
      after: { removedAt: removedAt.toISOString() },
    });
    return { id, removedAt };
  }

  /** Projects the caller works in: team projects (Coder/TL), assigned projects (Auditor), own vendor's (Vendor), all (Manager). */
  async mine(caller: AuthUser) {
    const where: Prisma.ProjectWhereInput =
      caller.role === 'MANAGER'
        ? {}
        : caller.role === 'AUDITOR'
          ? auditorProjectWhere(caller)
          : caller.role === 'VENDOR'
            ? vendorProjectWhere(requireVendor(caller))
            : { teamId: caller.teamId ?? '__none__' };
    const rows = await this.prisma.project.findMany({
      where: { ...where, isActive: true },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((p) => ({ id: p.id, name: p.name, client: p.client }));
  }
}
